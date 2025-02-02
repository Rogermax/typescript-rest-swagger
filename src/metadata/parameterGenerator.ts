import * as ts from 'typescript'
import {
  getDecoratorName,
  getDecoratorOptions,
  getDecoratorTextValue
} from '../utils/decoratorUtils'
import {
  ArrayType,
  MetadataGenerator,
  ObjectType,
  Parameter,
  Type
} from './metadataGenerator'
import {
  getCommonPrimitiveAndArrayUnionType,
  getLiteralValue,
  resolveType
} from './resolveType'

export class ParameterGenerator {
  constructor(
    private readonly parameter: ts.ParameterDeclaration,
    private readonly method: string,
    private readonly path: string,
    private readonly genericTypeMap?: Map<String, ts.TypeNode>
  ) {}

  public generate(): Parameter {
    try {
      const decoratorName = getDecoratorName(this.parameter, (identifier) => {
        return this.supportParameterDecorator(identifier.text)
      })

      switch (decoratorName) {
        case 'Param':
          return this.getRequestParameter(this.parameter)
        case 'CookieParam':
          return this.getCookieParameter(this.parameter)
        case 'FormParam':
          return this.getFormParameter(this.parameter)
        case 'HeaderParam':
          return this.getHeaderParameter(this.parameter)
        case 'QueryParam':
          return this.getQueryParameter(this.parameter)
        case 'PathParam':
          return this.getPathParameter(this.parameter)
        case 'FileParam':
          return this.getFileParameter(this.parameter)
        case 'FilesParam':
          return this.getFilesParameter(this.parameter)
        case 'Context':
        case 'ContextRequest':
        case 'ContextResponse':
        case 'ContextNext':
        case 'ContextLanguage':
        case 'ContextAccept':
          return this.getContextParameter(this.parameter)
        default:
          return this.getBodyParameter(this.parameter)
      }
    } catch (err) {
      console.error(err)
      throw new Error(err)
    }
  }

  private getCurrentLocation(): string {
    const methodId = (this.parameter.parent as ts.MethodDeclaration)
      .name as ts.Identifier
    const controllerId = (
      (this.parameter.parent as ts.MethodDeclaration)
        .parent as ts.ClassDeclaration
    ).name
    if (!controllerId) return `<unknown>.${methodId.text}`
    return `${controllerId.text}.${methodId.text}`
  }

  private getRequestParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text
    const type = this.getValidatedType(parameter)

    if (!this.supportsBodyParameters(this.method)) {
      throw new Error(
        `Param can't support '${this.getCurrentLocation()}' method.`
      )
    }
    return {
      description: this.getParameterDescription(parameter),
      in: 'param',
      name:
        getDecoratorTextValue(
          this.parameter,
          (ident) => ident.text === 'Param'
        ) || parameterName,
      parameterName,
      required: !parameter.questionToken,
      type
    }
  }

  private getContextParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text

    return {
      description: this.getParameterDescription(parameter),
      in: 'context',
      name: parameterName,
      parameterName,
      required: !parameter.questionToken,
      type: { typeName: '' }
    }
  }

  private getFileParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text

    if (!this.supportsBodyParameters(this.method)) {
      throw new Error(
        `FileParam can't support '${this.getCurrentLocation()}' method.`
      )
    }

    return {
      description: this.getParameterDescription(parameter),
      in: 'formData',
      name:
        getDecoratorTextValue(
          this.parameter,
          (ident) => ident.text === 'FileParam'
        ) || parameterName,
      parameterName,
      required: !parameter.questionToken,
      type: { typeName: 'file' }
    }
  }

  private getFilesParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text

    if (!this.supportsBodyParameters(this.method)) {
      throw new Error(
        `FilesParam can't support '${this.getCurrentLocation()}' method.`
      )
    }

    return {
      description: this.getParameterDescription(parameter),
      in: 'formData',
      name:
        getDecoratorTextValue(
          this.parameter,
          (ident) => ident.text === 'FilesParam'
        ) || parameterName,
      parameterName,
      required: !parameter.questionToken,
      type: { typeName: 'file' }
    }
  }

  private getFormParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text
    const type = this.getValidatedType(parameter)

    if (!this.supportsBodyParameters(this.method)) {
      throw new Error(
        `Form can't support '${this.getCurrentLocation()}' method.`
      )
    }

    return {
      description: this.getParameterDescription(parameter),
      in: 'formData',
      name:
        getDecoratorTextValue(
          this.parameter,
          (ident) => ident.text === 'FormParam'
        ) || parameterName,
      parameterName,
      required: !parameter.questionToken && !parameter.initializer,
      type
    }
  }

  private getCookieParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text
    //        const type = this.getValidatedType(parameter);

    // if (!this.supportPathDataType(type)) {
    //     throw new Error(`Cookie can't support '${this.getCurrentLocation()}' method.`);
    // }

    return {
      description: this.getParameterDescription(parameter),
      in: 'cookie',
      name:
        getDecoratorTextValue(
          this.parameter,
          (ident) => ident.text === 'CookieParam'
        ) || parameterName,
      parameterName,
      required: !parameter.questionToken && !parameter.initializer,
      type: { typeName: '' }
    }
  }

  private getBodyParameter(parameter: ts.ParameterDeclaration): Parameter {
    let parameterName = `unknown_${Math.random()}`
    if (parameter.name) {
      if (ts.isIdentifier(parameter.name)) {
        parameterName = parameter.name.text
      } else {
        parameterName = `${parameter.kind}`
      }
    }
    const type = this.getValidatedType(parameter)

    if (!this.supportsBodyParameters(this.method)) {
      throw new Error(`Body can't support ${this.method} method`)
    }

    return {
      description: this.getParameterDescription(parameter),
      in: 'body',
      name: parameterName,
      parameterName,
      required: !parameter.questionToken && !parameter.initializer,
      type
    }
  }

  private getHeaderParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text
    const type = this.getValidatedType(parameter)

    if (!this.supportPathDataType(type)) {
      throw new InvalidParameterException(
        `Parameter '${parameterName}' can't be passed as a header parameter in '${this.getCurrentLocation()}'.`
      )
    }

    return {
      description: this.getParameterDescription(parameter),
      in: 'header',
      name:
        getDecoratorTextValue(
          this.parameter,
          (ident) => ident.text === 'HeaderParam'
        ) || parameterName,
      parameterName,
      required: !parameter.questionToken && !parameter.initializer,
      type
    }
  }

  private getQueryParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text
    const parameterOptions =
      getDecoratorOptions(
        this.parameter,
        (ident) => ident.text === 'QueryParam'
      ) || {}
    let type = this.getValidatedType(parameter)

    if (!this.supportQueryDataType(type)) {
      const arrayType = getCommonPrimitiveAndArrayUnionType(parameter.type)
      if (arrayType && this.supportQueryDataType(arrayType)) {
        type = arrayType
      } else {
        throw new InvalidParameterException(
          `Parameter '${parameterName}' can't be passed as a query parameter in '${this.getCurrentLocation()}'.`
        )
      }
    }

    return {
      // allowEmptyValue: parameterOptions.allowEmptyValue,
      collectionFormat: parameterOptions.collectionFormat,
      default: this.getDefaultValue(parameter.initializer),
      description: this.getParameterDescription(parameter),
      in: 'query',
      // maxItems: parameterOptions.maxItems,
      // minItems: parameterOptions.minItems,
      name:
        getDecoratorTextValue(
          this.parameter,
          (ident) => ident.text === 'QueryParam'
        ) || parameterName,
      parameterName,
      required: !parameter.questionToken && !parameter.initializer,
      type
    }
  }

  private getPathParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text
    const type = this.getValidatedType(parameter)
    const pathName =
      getDecoratorTextValue(
        this.parameter,
        (ident) => ident.text === 'PathParam'
      ) || parameterName

    if (!this.supportPathDataType(type)) {
      throw new InvalidParameterException(
        `Parameter '${parameterName}:${
          type.typeName
        }' can't be passed as a path parameter in '${this.getCurrentLocation()}'.`
      )
    }
    if (
      !this.path.includes(`{${pathName}}`) &&
      !this.path.includes(`:${pathName}`)
    ) {
      throw new Error(
        `Parameter '${parameterName}' can't match in path: '${this.path}'`
      )
    }

    return {
      description: this.getParameterDescription(parameter),
      in: 'path',
      name: pathName,
      parameterName,
      required: true,
      type
    }
  }

  private getParameterDescription(node: ts.ParameterDeclaration): string {
    const symbol = MetadataGenerator.current.typeChecker.getSymbolAtLocation(
      node.name
    )

    if (symbol) {
      const comments = symbol.getDocumentationComment(
        MetadataGenerator.current.typeChecker
      )
      if (comments.length > 0) {
        return ts.displayPartsToString(comments)
      }
    }

    return ''
  }

  private supportsBodyParameters(method: string): boolean {
    return ['delete', 'post', 'put', 'patch'].some((m) => m === method)
  }

  private supportParameterDecorator(decoratorName: string): boolean {
    return [
      'HeaderParam',
      'QueryParam',
      'Param',
      'FileParam',
      'PathParam',
      'FilesParam',
      'FormParam',
      'CookieParam',
      'Context',
      'ContextRequest',
      'ContextResponse',
      'ContextNext',
      'ContextLanguage',
      'ContextAccept'
    ].some((d) => d === decoratorName)
  }

  private supportPathDataType(parameterType: Type): string | undefined {
    return [
      'string',
      'integer',
      'long',
      'float',
      'double',
      'date',
      'datetime',
      'buffer',
      'boolean',
      'enum'
    ].find((t) => t === parameterType.typeName)
  }

  private supportQueryDataType(parameterType: Type): string | undefined {
    // Copied from supportPathDataType and added 'array'. Not sure if all options apply to queries, but kept to avoid breaking change.
    console.log('supportQueryDataType::parameterType::', parameterType.typeName)
    return [
      'string',
      'integer',
      'long',
      'float',
      'double',
      'date',
      'datetime',
      'buffer',
      'boolean',
      'enum',
      'array'
    ].find((t) => t === parameterType.typeName)
  }

  private getValidatedType(
    parameter: ts.ParameterDeclaration
  ): Type | ObjectType | ArrayType {
    if (!parameter.type) {
      throw new Error(
        `Parameter ${parameter.name.getText()} doesn't have a valid type assigned in '${this.getCurrentLocation()}'.`
      )
    }
    return resolveType(parameter.type, this.genericTypeMap)
  }

  private getDefaultValue(initializer?: ts.Expression): any {
    if (!initializer) {
      return
    }
    return getLiteralValue(initializer)
  }
}

class InvalidParameterException extends Error {}
