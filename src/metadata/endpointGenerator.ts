'use strict'

import * as debug from 'debug'
import * as _ from 'lodash'
import * as ts from 'typescript'
import { getDecorators } from '../utils/decoratorUtils'
import { ResponseType } from './metadataGenerator'
import { resolveType } from './resolveType'

export abstract class EndpointGenerator<T extends ts.Node> {
  protected node: T
  protected debugger: debug.Debugger

  constructor(node: T, name: string) {
    this.node = node
    this.debugger = debug(`typescript-rest-swagger:metadata:${name}`)
  }

  protected getDecoratorValues(
    decoratorName: string,
    acceptMultiple: boolean = false
  ): any[] {
    const decorators = getDecorators(
      this.node,
      (decorator) => decorator.text === decoratorName
    )
    if (!decorators || decorators.length === 0) {
      return []
    }
    if (!acceptMultiple && decorators.length > 1) {
      throw new Error(
        `Only one ${decoratorName} decorator allowed in ${this.getCurrentLocation()}.`
      )
    }
    let result: any[]
    if (acceptMultiple) {
      result = decorators.map((d) => d.arguments)
    } else {
      const d = decorators[0]
      result = d.arguments
    }
    this.debugger('Arguments of decorator %s: %j', decoratorName, result)
    return result
  }

  protected getSecurity():
    | Array<{
        name: any
        scopes: string[]
      }>
    | undefined {
    const securities = this.getDecoratorValues('Security', true)
    if (!securities || securities.length === 0) {
      return undefined
    }

    return securities.map((security) => ({
      name: security[1] ? security[1] : 'default',
      scopes: security[0] ? _.castArray(this.handleRolesArray(security[0])) : []
    }))
  }

  protected handleRolesArray(argument: ts.ArrayLiteralExpression): string[] {
    if (ts.isArrayLiteralExpression(argument)) {
      return argument.elements
        .map((value) => value.getText())
        .map((val) =>
          val?.startsWith("'") && val?.endsWith("'") ? val.slice(1, -1) : val
        )
    } else {
      return argument
    }
  }

  protected getExamplesValue(argument: any): any {
    let example: any = {}
    this.debugger(argument)
    if (argument.properties) {
      argument.properties.forEach((p: any) => {
        example[p.name.text] = this.getInitializerValue(p.initializer)
      })
    } else {
      example = this.getInitializerValue(argument)
    }
    this.debugger(
      'Example extracted for %s: %j',
      this.getCurrentLocation(),
      example
    )
    return example
  }

  protected getInitializerValue(initializer: any): any {
    switch (initializer.kind as ts.SyntaxKind) {
      case ts.SyntaxKind.ArrayLiteralExpression:
        return initializer.elements.map((e: any) => this.getInitializerValue(e))
      case ts.SyntaxKind.StringLiteral:
        return initializer.text
      case ts.SyntaxKind.TrueKeyword:
        return true
      case ts.SyntaxKind.FalseKeyword:
        return false
      case ts.SyntaxKind.NumberKeyword:
      case ts.SyntaxKind.FirstLiteralToken:
        return parseInt(initializer.text, 10)
      case ts.SyntaxKind.ObjectLiteralExpression:
        // eslint-disable-next-line no-case-declarations
        const nestedObject: any = {}

        initializer.properties.forEach((p: any) => {
          nestedObject[p.name.text] = this.getInitializerValue(p.initializer)
        })

        return nestedObject
      default:
        return undefined
    }
  }

  protected getResponses(
    genericTypeMap?: Map<String, ts.TypeNode>
  ): ResponseType[] {
    const decorators = getDecorators(
      this.node,
      (decorator) => decorator.text === 'Response'
    )
    if (!decorators || decorators.length === 0) {
      return []
    }
    this.debugger('Generating Responses for %s', this.getCurrentLocation())

    return decorators.map((decorator) => {
      let description = ''
      let status = '200'
      let examples
      if (decorator.arguments.length > 0 && decorator.arguments[0]) {
        status = decorator.arguments[0]
      }
      if (decorator.arguments.length > 1 && decorator.arguments[1]) {
        description = decorator.arguments[1]
      }
      if (decorator.arguments.length > 2 && decorator.arguments[2]) {
        const argument = decorator.arguments[2]
        examples = this.getExamplesValue(argument)
      }
      const responses = {
        description,
        examples,
        schema:
          decorator.typeArguments && decorator.typeArguments.length > 0
            ? resolveType(decorator.typeArguments[0], genericTypeMap)
            : undefined,
        status
      }
      this.debugger(
        'Generated Responses for %s: %j',
        this.getCurrentLocation(),
        responses
      )

      return responses
    })
  }

  protected abstract getCurrentLocation(): string
}
