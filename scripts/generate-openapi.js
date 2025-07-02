// scripts/generate-openapi.js
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

class APIRouteScanner {
  constructor() {
    this.routes = [];
    this.plugins = [];
  }

  scanPlugins() {
    const pluginsDir = 'src/plugins';
    const plugins = fs.readdirSync(pluginsDir);
    
    plugins.forEach(plugin => {
      const routesPath = path.join(pluginsDir, plugin, 'server/routes');
      if (fs.existsSync(routesPath)) {
        this.scanRoutes(routesPath, plugin);
      }
    });
    
    return this.generateOpenAPISpec();
  }

  scanRoutes(routesPath, pluginName) {
    const files = fs.readdirSync(routesPath);
    
    files.forEach(file => {
      if (file.endsWith('.ts')) {
        const filePath = path.join(routesPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        this.parseRouteFile(content, pluginName, file);
      }
    });
  }

  parseRouteFile(content, pluginName, fileName) {
    // Parse TypeScript AST to find router.get(), router.post(), etc.
    const sourceFile = ts.createSourceFile(
      fileName,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const routes = this.extractRoutes(sourceFile);
    routes.forEach(route => {
      route.plugin = pluginName;
      this.routes.push(route);
    });
  }

  extractRoutes(node) {
    const routes = [];
    
    const visit = (node) => {
      // Look for router.get(), router.post(), etc.
      if (ts.isCallExpression(node) && 
          ts.isPropertyAccessExpression(node.expression)) {
        
        const method = node.expression.name.text;
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
          const route = this.parseRouteDefinition(node, method);
          if (route) routes.push(route);
        }
      }
      
      ts.forEachChild(node, visit);
    };
    
    visit(node);
    return routes;
  }

  parseRouteDefinition(callExpression, method) {
    // Extract route configuration
    const [routeConfig] = callExpression.arguments;
    
    if (!ts.isObjectLiteralExpression(routeConfig)) return null;
    
    const route = {
      method: method.toUpperCase(),
      path: null,
      validate: {},
      description: null,
      tags: []
    };

    routeConfig.properties.forEach(prop => {
      if (ts.isPropertyAssignment(prop)) {
        const name = prop.name.text;
        
        switch (name) {
          case 'path':
            route.path = this.extractStringLiteral(prop.initializer);
            break;
          case 'validate':
            route.validate = this.parseValidationSchema(prop.initializer);
            break;
          case 'options':
            this.parseRouteOptions(prop.initializer, route);
            break;
        }
      }
    });

    return route.path ? route : null;
  }

  parseValidationSchema(node) {
    // Parse @osd/config-schema validation
    const validation = {};
    
    if (ts.isObjectLiteralExpression(node)) {
      node.properties.forEach(prop => {
        if (ts.isPropertyAssignment(prop)) {
          const key = prop.name.text; // params, query, body
          validation[key] = this.parseSchemaObject(prop.initializer);
        }
      });
    }
    
    return validation;
  }

  parseSchemaObject(node) {
    // Convert @osd/config-schema to OpenAPI schema
    // This is where we handle schema.object(), schema.string(), etc.
    return this.convertSchemaToOpenAPI(node);
  }

  convertSchemaToOpenAPI(schemaNode) {
    // Implementation to convert @osd/config-schema to OpenAPI format
    // Returns OpenAPI schema object
    return {
      type: 'object',
      properties: {},
      // ... conversion logic
    };
  }

  generateOpenAPISpec() {
    const spec = {
      openapi: '3.0.3',
      info: {
        title: 'OpenSearch Dashboards API',
        version: '1.0.0',
        description: 'Auto-generated API documentation'
      },
      paths: {},
      components: {
        schemas: {}
      }
    };

    // Group routes by plugin
    const routesByPlugin = {};
    this.routes.forEach(route => {
      if (!routesByPlugin[route.plugin]) {
        routesByPlugin[route.plugin] = [];
      }
      routesByPlugin[route.plugin].push(route);
    });

    // Generate paths
    this.routes.forEach(route => {
      if (!spec.paths[route.path]) {
        spec.paths[route.path] = {};
      }
      
      spec.paths[route.path][route.method.toLowerCase()] = {
        tags: [route.plugin],
        summary: route.description || `${route.method} ${route.path}`,
        parameters: this.generateParameters(route.validate),
        requestBody: this.generateRequestBody(route.validate),
        responses: this.generateResponses(route)
      };
    });

    return spec;
  }
}

if (require.main === module) {
  const scanner = new APIRouteScanner();
  const spec = scanner.scanPlugins();
  
  // Write to file
  fs.writeFileSync('docs/openapi/generated/api-spec.json', JSON.stringify(spec, null, 2));
  console.log('OpenAPI specification generated successfully');
}

module.exports = APIRouteScanner;
