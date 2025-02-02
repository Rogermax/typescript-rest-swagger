import * as pathUtil from 'path'
import * as ts from 'typescript'
import { getDecorators } from '../utils/decoratorUtils'
import {
  getJSDocDescription,
  getJSDocTag,
  isExistJSDocTag
} from '../utils/jsDocUtils'
import { normalizePath } from '../utils/pathUtils'
import { EndpointGenerator } from './endpointGenerator'
import {
  Method,
  Parameter,
  ResponseData,
  ResponseType,
  Type
} from './metadataGenerator'
import { ParameterGenerator } from './parameterGenerator'
import { resolveType } from './resolveType'

export class MethodGenerator extends EndpointGenerator<ts.MethodDeclaration> {
  private method: string
  private path: string

  constructor(
    node: ts.MethodDeclaration,
    private readonly controllerPath: string,
    private readonly genericTypeMap?: Map<String, ts.TypeNode>
  ) {
    super(node, 'methods')
    this.processMethodDecorators()
  }

  public isValid(): boolean {
    return !!this.method
  }

  public getMethodName(): string {
    const identifier = this.node.name as ts.Identifier
    return identifier.text
  }

  public generate(): Method {
    if (!this.isValid()) {
      throw new Error("This isn't a valid controller method.")
    }

    this.debugger(
      'Generating Metadata for method %s',
      this.getCurrentLocation()
    )
    const identifier = this.node.name as ts.Identifier
    const type = resolveType(this.node.type, this.genericTypeMap)
    const responses = this.mergeResponses(
      this.getResponses(this.genericTypeMap),
      this.getMethodSuccessResponse(type)
    )

    const methodMetadata = {
      consumes: this.getDecoratorValues('Consumes'),
      deprecated: isExistJSDocTag(this.node, 'deprecated'),
      description: getJSDocDescription(this.node),
      method: this.method,
      name: identifier.text,
      parameters: this.buildParameters(),
      path: this.path,
      produces: this.getDecoratorValues('Produces')
        ? this.getDecoratorValues('Produces')
        : this.getDecoratorValues('Accept'),
      responses,
      security: this.getSecurity(),
      summary: getJSDocTag(this.node, 'summary'),
      tags: this.getDecoratorValues('Tags'),
      type
    }
    this.debugger(
      'Generated Metadata for method %s: %j',
      this.getCurrentLocation(),
      methodMetadata
    )
    return methodMetadata
  }

  protected getCurrentLocation(): string {
    const methodId = this.node.name as ts.Identifier
    const controllerId = (this.node.parent as ts.ClassDeclaration).name
    if (!controllerId) return `<unknown>.${methodId.text}`
    return `${controllerId.text}.${methodId.text}`
  }

  private buildParameters(): Parameter[] {
    this.debugger('Processing method %s parameters.', this.getCurrentLocation())
    const parameters = this.node.parameters
      .map((p) => {
        try {
          const path = pathUtil.posix.join(
            '/',
            this.controllerPath ? this.controllerPath : '',
            this.path
          )

          return new ParameterGenerator(
            p,
            this.method,
            path,
            this.genericTypeMap
          ).generate()
        } catch (e) {
          console.log('paramenter.name', p.name)
          const methodId = this.node.name as ts.Identifier
          const controllerId = (this.node.parent as ts.ClassDeclaration).name
          const parameterId = p.name as ts.Identifier
          if (!controllerId)
            return `Error generate parameter method: '<unknown>.${
              methodId.text
            }' argument: ${parameterId.text} ${JSON.stringify(e)}`
          const err = `Error generate parameter method: '${controllerId.text}.${
            methodId.text
          }' argument: ${parameterId.text} ${JSON.stringify(e)}`
          console.error(err)
          throw new Error(err)
        }
      })
      .filter(
        (p: Parameter) => p.in !== 'context' && p.in !== 'cookie'
      ) as Parameter[]

    const bodyParameters = parameters.filter((p) => p.in === 'body')
    const formParameters = parameters.filter((p) => p.in === 'formData')

    if (bodyParameters.length > 1) {
      throw new Error(
        `Only one body parameter allowed in '${this.getCurrentLocation()}' method.`
      )
    }
    if (bodyParameters.length > 0 && formParameters.length > 0) {
      throw new Error(
        `Choose either during @FormParam and @FileParam or body parameter  in '${this.getCurrentLocation()}' method.`
      )
    }
    this.debugger(
      'Parameters list for method %s: %j.',
      this.getCurrentLocation(),
      parameters
    )
    return parameters
  }

  private processMethodDecorators(): void {
    const httpMethodDecorators = getDecorators(this.node, (decorator) =>
      this.supportsPathMethod(decorator.text)
    )

    if (!httpMethodDecorators || httpMethodDecorators.length === 0) {
      return
    }
    if (httpMethodDecorators.length > 1) {
      throw new Error(
        `Only one HTTP Method decorator in '${this.getCurrentLocation()}' method is acceptable, Found: ${httpMethodDecorators
          .map((d) => d.text)
          .join(', ')}`
      )
    }

    const methodDecorator = httpMethodDecorators[0]
    this.method = methodDecorator.text.toLowerCase()
    this.debugger('Processing method %s decorators.', this.getCurrentLocation())

    const pathDecorators = getDecorators(
      this.node,
      (decorator) => decorator.text === 'Path'
    )

    if (pathDecorators && pathDecorators.length > 1) {
      throw new Error(
        `Only one Path decorator in '${this.getCurrentLocation()}' method is acceptable, Found: ${httpMethodDecorators
          .map((d) => d.text)
          .join(', ')}`
      )
    }
    if (pathDecorators) {
      const pathDecorator = pathDecorators[0]
      this.path = pathDecorator
        ? `/${normalizePath(pathDecorator.arguments[0])}`
        : ''
    } else {
      this.path = ''
    }
    this.debugger('Mapping endpoint %s %s', this.method, this.path)
  }

  private getMethodSuccessResponse(type: Type): ResponseType {
    const responseData = this.getMethodSuccessResponseData(type)
    return {
      description: type.typeName === 'void' ? 'No content' : 'Ok',
      examples: this.getMethodSuccessExamples(),
      schema: responseData.type,
      status: responseData.status
    }
  }

  private getMethodSuccessResponseData(type: Type): ResponseData {
    switch (type.typeName) {
      case 'void':
        return { status: '204', type }
      case 'NewResource':
        return { status: '201', type: type.typeArgument || type }
      case 'RequestAccepted':
        return { status: '202', type: type.typeArgument || type }
      case 'MovedPermanently':
        return { status: '301', type: type.typeArgument || type }
      case 'MovedTemporarily':
        return { status: '302', type: type.typeArgument || type }
      case 'DownloadResource':
      case 'DownloadBinaryData':
        return { status: '200', type: { typeName: 'buffer' } }
      default:
        return { status: '200', type }
    }
  }

  private getMethodSuccessExamples(): any {
    const exampleDecorators = getDecorators(
      this.node,
      (decorator) => decorator.text === 'Example'
    )
    if (!exampleDecorators || exampleDecorators.length === 0) {
      return undefined
    }
    if (exampleDecorators.length > 1) {
      throw new Error(
        `Only one Example decorator allowed in '${this.getCurrentLocation()}' method.`
      )
    }

    const d = exampleDecorators[0]
    const argument = d.arguments[0]

    return this.getExamplesValue(argument)
  }

  private mergeResponses(
    responses: ResponseType[],
    defaultResponse: ResponseType
  ): ResponseType[] {
    if (!responses || responses.length === 0) {
      return [defaultResponse]
    }

    const index = responses.findIndex(
      (resp) => resp.status === defaultResponse.status
    )

    if (index >= 0) {
      if (defaultResponse.examples && !responses[index].examples) {
        responses[index].examples = defaultResponse.examples
      }
    } else {
      responses.push(defaultResponse)
    }
    return responses
  }

  private supportsPathMethod(method: string): boolean {
    return ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS', 'HEAD'].some(
      (m) => m === method
    )
  }
}
