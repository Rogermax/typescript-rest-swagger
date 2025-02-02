import * as debug from 'debug'
import * as glob from 'glob'
import * as _ from 'lodash'
import * as mm from 'minimatch'
import * as ts from 'typescript'
import { isDecorator } from '../utils/decoratorUtils'
import { ControllerGenerator } from './controllerGenerator'

export class MetadataGenerator {
  public static current: MetadataGenerator
  public readonly nodes = new Array<ts.Node>()
  public readonly typeChecker: ts.TypeChecker
  private readonly program: ts.Program
  private referenceTypes: { [typeName: string]: ReferenceType } = {}
  private readonly circularDependencyResolvers = new Array<
    (referenceTypes: { [typeName: string]: ReferenceType }) => void
  >()

  private readonly debugger = debug('typescript-rest-swagger:metadata')

  constructor(
    entryFile: string | string[],
    compilerOptions: ts.CompilerOptions,
    private readonly ignorePaths?: string[]
  ) {
    const sourceFiles = this.getSourceFiles(entryFile)
    this.debugger('Starting Metadata Generator')
    this.debugger('Source files: %j ', sourceFiles)
    this.debugger('Compiler Options: %j ', compilerOptions)
    this.program = ts.createProgram(sourceFiles, compilerOptions)
    this.typeChecker = this.program.getTypeChecker()
    MetadataGenerator.current = this
  }

  public generate(): Metadata {
    this.program.getSourceFiles().forEach((sf) => {
      if (this.ignorePaths && this.ignorePaths.length > 0) {
        for (const path of this.ignorePaths) {
          if (
            !sf.fileName.includes('node_modules/typescript-rest/') &&
            mm(sf.fileName, path)
          ) {
            return
          }
        }
      }

      ts.forEachChild(sf, (node) => {
        this.nodes.push(node)
      })
    })

    this.debugger('Building Metadata for controllers Generator')
    const controllers = this.buildControllers()

    this.debugger('Handling circular references')
    this.circularDependencyResolvers.forEach((c) => c(this.referenceTypes))

    return {
      controllers,
      referenceTypes: this.referenceTypes
    }
  }

  public TypeChecker(): ts.TypeChecker {
    return this.typeChecker
  }

  public addReferenceType(referenceType: ReferenceType): void {
    this.referenceTypes[referenceType.typeName] = referenceType
  }

  public getReferenceType(typeName: string): ReferenceType {
    return this.referenceTypes[typeName]
  }

  public onFinish(
    callback: (referenceTypes: { [typeName: string]: ReferenceType }) => void
  ): void {
    this.circularDependencyResolvers.push(callback)
  }

  public getClassDeclaration(className: string): ts.Node | undefined {
    const found = this.nodes.filter((node) => {
      const classDeclaration = node as ts.ClassDeclaration
      return (
        node.kind === ts.SyntaxKind.ClassDeclaration &&
        classDeclaration.name &&
        classDeclaration.name.text === className
      )
    })
    if (found && found.length > 0) {
      return found[0]
    }
    return undefined
  }

  public getInterfaceDeclaration(className: string): ts.Node | undefined {
    const found = this.nodes.filter((node) => {
      const interfaceDeclaration = node as ts.InterfaceDeclaration
      return (
        node.kind === ts.SyntaxKind.InterfaceDeclaration &&
        interfaceDeclaration.name &&
        interfaceDeclaration.name.text === className
      )
    })
    if (found && found.length > 0) {
      return found[0]
    }
    return undefined
  }

  private getSourceFiles(sourceFiles: string | string[]): string[] {
    this.debugger('Getting source files from expressions')
    this.debugger('Source file patterns: %j ', sourceFiles)
    const sourceFilesExpressions = _.castArray(sourceFiles)
    const result: Set<string> = new Set<string>()
    const options = { cwd: process.cwd() }
    sourceFilesExpressions.forEach((pattern) => {
      this.debugger('Searching pattern: %s with options: %j', pattern, options)
      const matches = glob.sync(pattern, options)
      matches.forEach((file) => result.add(file))
    })

    return Array.from(result)
  }

  private buildControllers(): Controller[] {
    return this.nodes
      .filter((node) => node.kind === ts.SyntaxKind.ClassDeclaration)
      .filter(
        (node) => !isDecorator(node, (decorator) => decorator.text === 'Hidden')
      )
      .map(
        (classDeclaration: ts.ClassDeclaration) =>
          new ControllerGenerator(classDeclaration)
      )
      .filter((generator) => generator.isValid())
      .map((generator) => generator.generate())
  }
}

export interface Metadata {
  controllers: Controller[]
  referenceTypes: { [typeName: string]: ReferenceType }
}

export interface Controller {
  location: string
  methods: Method[]
  name: string
  path: string
  consumes: string[]
  produces: string[]
  responses: ResponseType[]
  tags: string[]
  security?: Security[]
}

export interface Method {
  deprecated?: boolean
  description: string
  method: string
  name: string
  parameters: Parameter[]
  path: string
  type: Type
  tags: string[]
  responses: ResponseType[]
  security?: Security[]
  summary?: string
  consumes: string[]
  produces: string[]
}

export interface Parameter {
  parameterName: string
  description: string
  in: string
  name: string
  required: boolean
  type: Type
  collectionFormat?: boolean
  allowEmptyValue?: boolean
  default?: any
  maxItems?: number
  minItems?: number
}

export interface Security {
  name: string
  scopes?: string[]
}

export interface Type {
  typeName: string
  typeArgument?: Type
}

export interface EnumerateType extends Type {
  enumMembers: string[]
}

export interface ReferenceType extends Type {
  description: string
  properties: Property[]
  additionalProperties?: Property[]
}

export interface ObjectType extends Type {
  properties: Property[]
}

export interface ArrayType extends Type {
  elementType: Type
}

export interface ResponseType {
  description: string
  status: string
  schema?: Type
  examples?: any
}

export interface Property {
  description: string
  name: string
  type: Type
  required: boolean
}

export interface ResponseData {
  status: string
  type: Type
}
