// scripts/generate-openapi.js
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

class OpenSearchDashboardsAPIScanner {
  constructor() {
    this.routes = [];
    this.basePaths = new Map(); // Store base paths for different routers
  }

  scanAllRoutes() {
    console.log('🔍 Scanning OpenSearch Dashboards routes...');
    
    // Scan core routes
    this.scanCoreRoutes();
    
    // Scan plugin routes
    this.scanPluginRoutes();
    
    console.log(`📊 Found ${this.routes.length} routes total`);
    return this.generateOpenAPISpec();
  }

  scanCoreRoutes() {
    const coreRoutesDir = 'src/core/server';
    this.scanDirectory(coreRoutesDir, 'core');
  }

  scanPluginRoutes() {
    const pluginsDir = 'src/plugins';
    if (fs.existsSync(pluginsDir)) {
      const plugins = fs.readdirSync(pluginsDir);
      plugins.forEach(plugin => {
        const pluginRoutesPath = path.join(pluginsDir, plugin, 'server');
        if (fs.existsSync(pluginRoutesPath)) {
          this.scanDirectory(pluginRoutesPath, plugin);
        }
      });
    }
  }

  scanDirectory(dirPath, context) {
    try {
      this.findRouteFiles(dirPath, context);
    } catch (error) {
      console.warn(`⚠️  Warning: Could not scan ${dirPath}: ${error.message}`);
    }
  }

  findRouteFiles(dirPath, context) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    entries.forEach(entry => {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        this.findRouteFiles(fullPath, context);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        // Skip test files
        if (!entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
          this.parseRouteFile(fullPath, context);
        }
      }
    });
  }

  parseRouteFile(filePath, context) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      // Extract base paths from router creation
      this.extractBasePaths(sourceFile, filePath);
      
      // Extract routes from the file
      const routes = this.extractRoutes(sourceFile, context, filePath);
      this.routes.push(...routes);
      
      if (routes.length > 0) {
        console.log(`✅ Found ${routes.length} routes in ${filePath}`);
      }
    } catch (error) {
      console.warn(`⚠️  Warning: Could not parse ${filePath}: ${error.message}`);
    }
  }

  extractBasePaths(sourceFile, filePath) {
    const visit = (node) => {
      // Look for: http.createRouter('/api/saved_objects/')
      if (ts.isCallExpression(node) && 
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'createRouter') {
        
        const [pathArg] = node.arguments;
        if (pathArg && ts.isStringLiteral(pathArg)) {
          this.basePaths.set(filePath, pathArg.text);
          console.log(`📍 Found base path: ${pathArg.text} in ${filePath}`);
        }
      }
      
      ts.forEachChild(node, visit);
    };
    
    visit(sourceFile);
  }

  extractRoutes(sourceFile, context, filePath) {
    const routes = [];
    
    const visit = (node) => {
      // Look for router.get(), router.post(), etc.
      if (ts.isCallExpression(node) && 
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'router') {
        
        const method = node.expression.name.text;
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
          const route = this.parseRouteDefinition(node, method, context, filePath);
          if (route) {
            routes.push(route);
          }
        }
      }
      
      ts.forEachChild(node, visit);
    };
    
    visit(sourceFile);
    return routes;
  }

  parseRouteDefinition(callExpression, method, context, filePath) {
    const [routeConfig] = callExpression.arguments;
    
    if (!routeConfig || !ts.isObjectLiteralExpression(routeConfig)) {
      return null;
    }
    
    const route = {
      method: method.toUpperCase(),
      path: null,
      validate: {},
      context,
      filePath,
      basePath: this.basePaths.get(filePath) || this.guessBasePath(context, filePath)
    };

    // Parse the route configuration object
    routeConfig.properties.forEach(prop => {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const name = prop.name.text;
        
        switch (name) {
          case 'path':
            route.path = this.extractStringLiteral(prop.initializer);
            break;
          case 'validate':
            route.validate = this.parseValidationSchema(prop.initializer);
            break;
        }
      }
    });

    if (route.path) {
      // Combine base path with route path
      route.fullPath = this.combinePaths(route.basePath, route.path);
      return route;
    }
    
    return null;
  }

  extractStringLiteral(node) {
    if (ts.isStringLiteral(node)) {
      return node.text;
    }
    if (ts.isTemplateExpression(node)) {
      // Handle template literals - simplified for now
      return node.head.text + '${...}';
    }
    return null;
  }

  parseValidationSchema(node) {
    const validation = {};
    
    if (ts.isObjectLiteralExpression(node)) {
      node.properties.forEach(prop => {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          const key = prop.name.text; // params, query, body
          validation[key] = this.parseSchemaObject(prop.initializer);
        }
      });
    }
    
    return validation;
  }

  parseSchemaObject(node) {
    // Convert @osd/config-schema to OpenAPI schema
    if (ts.isCallExpression(node)) {
      const methodName = this.getCallExpressionMethod(node);
      
      switch (methodName) {
        case 'schema.object':
          return this.parseObjectSchema(node);
        case 'schema.string':
          return this.parseStringSchema(node);
        case 'schema.number':
          return this.parseNumberSchema(node);
        case 'schema.boolean':
          return this.parseBooleanSchema(node);
        case 'schema.arrayOf':
          return this.parseArraySchema(node);
        case 'schema.maybe':
          return this.parseMaybeSchema(node);
        case 'schema.recordOf':
          return this.parseRecordSchema(node);
        case 'schema.oneOf':
          return this.parseOneOfSchema(node);
        case 'schema.literal':
          return this.parseLiteralSchema(node);
        default:
          return { type: 'object', description: `Unknown schema type: ${methodName}` };
      }
    }
    
    return {
      type: 'object',
      properties: {},
      description: 'Schema validation (complex type not fully parsed)'
    };
  }

  getCallExpressionMethod(node) {
    if (ts.isPropertyAccessExpression(node.expression)) {
      const object = node.expression.expression;
      const property = node.expression.name;
      
      if (ts.isIdentifier(object) && object.text === 'schema') {
        return `schema.${property.text}`;
      }
      if (ts.isPropertyAccessExpression(object) && 
          ts.isIdentifier(object.expression) && 
          object.expression.text === 'schema') {
        return `schema.${object.name.text}.${property.text}`;
      }
    }
    return 'unknown';
  }

  parseObjectSchema(node) {
    const [propertiesArg, optionsArg] = node.arguments;
    const schema = {
      type: 'object',
      properties: {},
      required: []
    };

    if (ts.isObjectLiteralExpression(propertiesArg)) {
      propertiesArg.properties.forEach(prop => {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          const propName = prop.name.text;
          const propSchema = this.parseSchemaObject(prop.initializer);
          
          schema.properties[propName] = propSchema;
          
          // Check if property is required (not wrapped in schema.maybe)
          if (!this.isOptionalSchema(prop.initializer)) {
            schema.required.push(propName);
          }
        }
      });
    }

    // Remove empty required array
    if (schema.required.length === 0) {
      delete schema.required;
    }

    return schema;
  }

  parseStringSchema(node) {
    const [optionsArg] = node.arguments;
    const schema = { type: 'string' };
    
    if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
      optionsArg.properties.forEach(prop => {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          const optionName = prop.name.text;
          if (optionName === 'defaultValue' && ts.isStringLiteral(prop.initializer)) {
            schema.default = prop.initializer.text;
          }
        }
      });
    }
    
    return schema;
  }

  parseNumberSchema(node) {
    const [optionsArg] = node.arguments;
    const schema = { type: 'number' };
    
    if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
      optionsArg.properties.forEach(prop => {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          const optionName = prop.name.text;
          if (optionName === 'defaultValue' && ts.isNumericLiteral(prop.initializer)) {
            schema.default = parseFloat(prop.initializer.text);
          }
          if (optionName === 'min' && ts.isNumericLiteral(prop.initializer)) {
            schema.minimum = parseFloat(prop.initializer.text);
          }
          if (optionName === 'max' && ts.isNumericLiteral(prop.initializer)) {
            schema.maximum = parseFloat(prop.initializer.text);
          }
        }
      });
    }
    
    return schema;
  }

  parseBooleanSchema(node) {
    const [optionsArg] = node.arguments;
    const schema = { type: 'boolean' };
    
    if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
      optionsArg.properties.forEach(prop => {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          const optionName = prop.name.text;
          if (optionName === 'defaultValue') {
            if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
              schema.default = true;
            } else if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) {
              schema.default = false;
            }
          }
        }
      });
    }
    
    return schema;
  }

  parseArraySchema(node) {
    const [itemsArg, optionsArg] = node.arguments;
    const schema = {
      type: 'array',
      items: itemsArg ? this.parseSchemaObject(itemsArg) : { type: 'string' }
    };
    
    if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
      optionsArg.properties.forEach(prop => {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          const optionName = prop.name.text;
          if (optionName === 'minSize' && ts.isNumericLiteral(prop.initializer)) {
            schema.minItems = parseFloat(prop.initializer.text);
          }
          if (optionName === 'maxSize' && ts.isNumericLiteral(prop.initializer)) {
            schema.maxItems = parseFloat(prop.initializer.text);
          }
        }
      });
    }
    
    return schema;
  }

  parseMaybeSchema(node) {
    const [innerArg] = node.arguments;
    const innerSchema = innerArg ? this.parseSchemaObject(innerArg) : { type: 'string' };
    // Maybe schemas are optional, so we don't mark them as required
    return innerSchema;
  }

  parseRecordSchema(node) {
    const [keyArg, valueArg] = node.arguments;
    return {
      type: 'object',
      additionalProperties: valueArg ? this.parseSchemaObject(valueArg) : { type: 'string' }
    };
  }

  parseOneOfSchema(node) {
    const schemas = node.arguments.map(arg => this.parseSchemaObject(arg));
    return {
      oneOf: schemas
    };
  }

  parseLiteralSchema(node) {
    const [valueArg] = node.arguments;
    if (ts.isStringLiteral(valueArg)) {
      return {
        type: 'string',
        enum: [valueArg.text]
      };
    }
    if (ts.isNumericLiteral(valueArg)) {
      return {
        type: 'number',
        enum: [parseFloat(valueArg.text)]
      };
    }
    return { type: 'string' };
  }

  isOptionalSchema(node) {
    if (ts.isCallExpression(node)) {
      const methodName = this.getCallExpressionMethod(node);
      return methodName === 'schema.maybe';
    }
    return false;
  }

  guessBasePath(context, filePath) {
    // Guess base path based on context and file path
    if (context === 'core' && filePath.includes('saved_objects')) {
      return '/api/saved_objects';
    }
    if (context !== 'core') {
      return `/api/${context}`;
    }
    return '/api';
  }

  combinePaths(basePath, routePath) {
    if (!basePath) basePath = '';
    if (!routePath) routePath = '';
    
    // Remove trailing slash from base, leading slash from route
    basePath = basePath.replace(/\/$/, '');
    routePath = routePath.replace(/^\//, '');
    
    return basePath + '/' + routePath;
  }

  generateOpenAPISpec() {
    const spec = {
      openapi: '3.0.3',
      info: {
        title: 'OpenSearch Dashboards API',
        version: '1.0.0',
        description: 'Auto-generated API documentation for OpenSearch Dashboards'
      },
      paths: {},
      components: {
        schemas: {},
        parameters: {
          type: {
            name: 'type',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'The type of saved object'
          },
          id: {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'The ID of the saved object'
          }
        }
      }
    };

    // Group routes by full path
    const pathGroups = {};
    this.routes.forEach(route => {
      if (!pathGroups[route.fullPath]) {
        pathGroups[route.fullPath] = {};
      }
      
      const operationId = `${route.method.toLowerCase()}_${route.fullPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const contextTag = this.getContextTag(route.context, route.filePath);
      
      pathGroups[route.fullPath][route.method.toLowerCase()] = {
        tags: [contextTag],
        summary: this.generateSummary(route),
        description: this.generateDescription(route),
        operationId: operationId,
        parameters: this.generateParameters(route),
        requestBody: this.generateRequestBody(route),
        responses: this.generateResponses(route)
      };
    });

    spec.paths = pathGroups;
    return spec;
  }

  getContextTag(context, filePath) {
    if (context === 'core' && filePath.includes('saved_objects')) {
      return 'saved objects';
    }
    return context;
  }

  generateSummary(route) {
    const action = this.getActionFromMethod(route.method);
    const resource = this.getResourceFromPath(route.path);
    
    if (resource) {
      return `${action} ${resource}`;
    }
    
    return `${route.method} ${route.fullPath}`;
  }

  generateDescription(route) {
    const fileName = path.basename(route.filePath, '.ts');
    return `${this.generateSummary(route)} (from ${fileName}.ts)`;
  }

  getActionFromMethod(method) {
    const actions = {
      'GET': 'Get',
      'POST': 'Create',
      'PUT': 'Update',
      'DELETE': 'Delete',
      'PATCH': 'Modify'
    };
    return actions[method] || method;
  }

  getResourceFromPath(path) {
    if (path.includes('saved_objects')) {
      if (path.includes('_find')) return 'saved objects by search criteria';
      if (path.includes('_export')) return 'saved objects export';
      if (path.includes('_import')) return 'saved objects import';
      if (path.includes('_bulk_create')) return 'multiple saved objects';
      if (path.includes('_bulk_get')) return 'multiple saved objects';
      if (path.includes('_bulk_update')) return 'multiple saved objects';
      if (path.includes('{type}/{id}')) return 'a saved object';
      return 'saved objects';
    }
    return null;
  }

  generateParameters(route) {
    const parameters = [];
    
    // Extract path parameters from the path pattern
    const pathParams = route.path.match(/\{([^}]+)\}/g);
    if (pathParams) {
      pathParams.forEach(param => {
        const paramName = param.replace(/[{}?]/g, '');
        const isOptional = param.includes('?');
        
        // Get parameter schema from validation if available
        let paramSchema = { type: 'string' };
        let description = `Path parameter: ${paramName}`;
        
        if (route.validate.params && route.validate.params.properties && route.validate.params.properties[paramName]) {
          paramSchema = route.validate.params.properties[paramName];
        }
        
        // Add better descriptions for common parameters
        if (paramName === 'type') {
          description = 'The type of saved object';
        } else if (paramName === 'id') {
          description = 'The ID of the saved object';
        }
        
        parameters.push({
          name: paramName,
          in: 'path',
          required: !isOptional,
          schema: paramSchema,
          description: description
        });
      });
    }
    
    // Add individual query parameters if validation exists
    if (route.validate.query && route.validate.query.properties) {
      Object.entries(route.validate.query.properties).forEach(([paramName, paramSchema]) => {
        const isRequired = route.validate.query.required && route.validate.query.required.includes(paramName);
        
        let description = `Query parameter: ${paramName}`;
        
        // Add better descriptions for common query parameters
        if (paramName === 'overwrite') {
          description = 'If set to true, will overwrite the existing saved object with same type and id.';
        } else if (paramName === 'per_page') {
          description = 'Number of objects to return per page';
        } else if (paramName === 'page') {
          description = 'Page number to return';
        }
        
        parameters.push({
          name: paramName,
          in: 'query',
          required: isRequired || false,
          schema: paramSchema,
          description: description
        });
      });
    }
    
    return parameters.length > 0 ? parameters : undefined;
  }

  generateRequestBody(route) {
    if (route.validate.body) {
      return {
        required: true,
        content: {
          'application/json': {
            schema: route.validate.body
          }
        }
      };
    }
    return undefined;
  }

  generateResponses(route) {
    const responses = {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: {
              type: 'object'
            }
          }
        }
      },
      '400': {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                message: { type: 'string' },
                statusCode: { type: 'number' }
              }
            }
          }
        }
      },
      '404': {
        description: 'Not found'
      },
      '500': {
        description: 'Internal server error'
      }
    };

    // Customize success response based on method
    if (route.method === 'POST') {
      responses['200'].description = 'The creation request is successful';
    } else if (route.method === 'PUT') {
      responses['200'].description = 'The update request is successful';
    } else if (route.method === 'DELETE') {
      responses['200'].description = 'The deletion request is successful';
    }

    return responses;
  }
}

// Main execution
if (require.main === module) {
  try {
    console.log('🚀 Starting OpenSearch Dashboards API documentation generation...');
    
    const scanner = new OpenSearchDashboardsAPIScanner();
    const spec = scanner.scanAllRoutes();
    
    // Ensure output directory exists
    const outputDir = 'docs/openapi/generated';
    if (!fs.existsSync(outputDir)) {
      console.log(`📁 Creating output directory: ${outputDir}`);
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write the specification
    const outputFile = path.join(outputDir, 'api-spec.json');
    fs.writeFileSync(outputFile, JSON.stringify(spec, null, 2));
    
    console.log(`✅ OpenAPI specification generated successfully!`);
    console.log(`📄 Output: ${outputFile}`);
    console.log(`📊 Generated documentation for ${Object.keys(spec.paths).length} API endpoints`);
    
    // Write a summary
    const summary = {
      generated: new Date().toISOString(),
      totalEndpoints: Object.keys(spec.paths).length,
      endpoints: Object.keys(spec.paths).sort()
    };
    
    fs.writeFileSync(
      path.join(outputDir, 'generation-summary.json'), 
      JSON.stringify(summary, null, 2)
    );
    
    console.log(`📋 Summary written to: ${path.join(outputDir, 'generation-summary.json')}`);
    
  } catch (error) {
    console.error('❌ Error generating OpenAPI specification:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = OpenSearchDashboardsAPIScanner;
