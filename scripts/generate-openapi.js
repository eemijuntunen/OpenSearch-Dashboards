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
    // This is a simplified version - can be enhanced
    return {
      type: 'object',
      properties: {},
      description: 'Schema validation (detailed parsing not implemented)'
    };
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
        schemas: {}
      }
    };

    // Group routes by full path
    const pathGroups = {};
    this.routes.forEach(route => {
      if (!pathGroups[route.fullPath]) {
        pathGroups[route.fullPath] = {};
      }
      
      pathGroups[route.fullPath][route.method.toLowerCase()] = {
        tags: [route.context],
        summary: `${route.method} ${route.fullPath}`,
        description: `Route from ${route.filePath}`,
        parameters: this.generateParameters(route),
        requestBody: this.generateRequestBody(route),
        responses: this.generateResponses()
      };
    });

    spec.paths = pathGroups;
    return spec;
  }

  generateParameters(route) {
    const parameters = [];
    
    // Extract path parameters from the path pattern
    const pathParams = route.path.match(/\{([^}]+)\}/g);
    if (pathParams) {
      pathParams.forEach(param => {
        const paramName = param.replace(/[{}]/g, '');
        parameters.push({
          name: paramName,
          in: 'path',
          required: !paramName.includes('?'), // {id?} means optional
          schema: { type: 'string' },
          description: `Path parameter: ${paramName}`
        });
      });
    }
    
    // Add query parameters if validation exists
    if (route.validate.query) {
      parameters.push({
        name: 'query',
        in: 'query',
        required: false,
        schema: { type: 'object' },
        description: 'Query parameters (detailed schema not parsed)'
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
            schema: {
              type: 'object',
              description: 'Request body (detailed schema not parsed)'
            }
          }
        }
      };
    }
    return undefined;
  }

  generateResponses() {
    return {
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
        description: 'Bad request'
      },
      '404': {
        description: 'Not found'
      },
      '500': {
        description: 'Internal server error'
      }
    };
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
