import * as _ from 'lodash'
import * as ts from 'typescript'
import { getDecoratorName } from '../utils/decoratorUtils'
import { getFirstMatchingJSDocTagName } from '../utils/jsDocUtils'
import { keywords } from './keywordKinds'
import {
  ArrayType,
  EnumerateType,
  MetadataGenerator,
  ObjectType,
  Property,
  ReferenceType,
  Type
} from './metadataGenerator'

const syntaxKindMap: { [kind: number]: string } = {}
syntaxKindMap[ts.SyntaxKind.NumberKeyword] = 'number'
syntaxKindMap[ts.SyntaxKind.StringKeyword] = 'string'
syntaxKindMap[ts.SyntaxKind.BooleanKeyword] = 'boolean'
syntaxKindMap[ts.SyntaxKind.VoidKeyword] = 'void'

const localReferenceTypeCache: { [typeName: string]: ReferenceType } = {}
const inProgressTypes: { [typeName: string]: boolean } = {}

type SupportedType =
  | ts.TypeReferenceNode
  | ts.TypeLiteralNode
  | ts.ArrayTypeNode
  | ts.TupleTypeNode
  | ts.NamedTupleMember
  | ts.OptionalTypeNode
  | ts.UnionTypeNode
  | ts.IntersectionTypeNode
  | ts.TypeOperatorNode
  | ts.IndexedAccessTypeNode
  | ts.MappedTypeNode
  | ts.LiteralTypeNode
  | ts.IndexedAccessTypeNode
  | ts.NodeWithTypeArguments
  | ts.KeywordTypeNode

function isSupportedType(node: ts.TypeNode): node is SupportedType {
  return (
    ts.isTypeReferenceNode(node) ||
    ts.isTypeLiteralNode(node) ||
    ts.isArrayTypeNode(node) ||
    ts.isTupleTypeNode(node) ||
    ts.isNamedTupleMember(node) ||
    ts.isOptionalTypeNode(node) ||
    ts.isUnionTypeNode(node) ||
    ts.isIntersectionTypeNode(node) ||
    ts.isTypeOperatorNode(node) ||
    ts.isIndexedAccessTypeNode(node) ||
    ts.isMappedTypeNode(node) ||
    ts.isLiteralTypeNode(node) ||
    ts.isIndexedAccessTypeNode(node) ||
    ts.isIdentifier(node) ||
    isKeywordTypeNode(node) ||
    isNodeWithTypeArguments(node)
  )
}

function isNodeWithTypeArguments(node: any): node is ts.NodeWithTypeArguments {
  return node.typeArguments !== undefined
}

function isKeywordTypeNode(node: any): node is ts.KeywordTypeNode {
  return node.kind !== undefined
}

type UsableDeclaration =
  | ts.InterfaceDeclaration
  | ts.ClassDeclaration
  | ts.TypeAliasDeclaration
export function resolveType(
  typeNode?: ts.TypeNode,
  genericTypeMap?: Map<String, ts.TypeNode>
): ObjectType | ArrayType | Type {
  if (typeNode === undefined) {
    return { typeName: 'void' }
  }
  if (!isSupportedType(typeNode)) {
    const err = `Unknown type: ${
      ts.SyntaxKind[typeNode.kind]
    }: ${typeNode.getText()}`
    console.error(err)
    throw new Error(
      `Unknown type: ${ts.SyntaxKind[typeNode.kind]}: ${typeNode.getText()}`
    )
  }
  const primitiveType = getPrimitiveType(typeNode)
  if (primitiveType !== undefined) {
    return primitiveType
  }

  if (ts.isArrayTypeNode(typeNode)) {
    const arrayType = typeNode
    if (isSupportedType(arrayType.elementType)) {
      return {
        elementType: resolveType(arrayType.elementType, genericTypeMap),
        typeName: 'array'
      }
    } else {
      const err = `Unknown type: ${
        ts.SyntaxKind[arrayType.elementType.kind]
      } inside array: ${arrayType.getText()}`
      console.error(err)
      throw new Error(err)
    }
  }

  if (ts.isTypeLiteralNode(typeNode)) {
    return getInlineObjectType(typeNode)
  }

  if (ts.isUnionTypeNode(typeNode)) {
    return getUnionType(typeNode)
  }

  if (ts.isIntersectionTypeNode(typeNode)) {
    throw new Error('Not implemented y')
    // return { typeName: 'void' }
    // TODO: return getIntersectionType(typeNode)
  }

  if (ts.isTupleTypeNode(typeNode) || ts.isNamedTupleMember(typeNode)) {
    throw new Error('Not implemented isTupleTypeNode')
    // return { typeName: 'void' }
    // TODO: return getTupleType(typeNode)
  }

  if (ts.isOptionalTypeNode(typeNode)) {
    throw new Error('Not implemented isOptionalTypeNode')
    // return { typeName: 'void' }
    // TODO: return getOptionalType(typeNode)
  }

  if (ts.isIndexedAccessTypeNode(typeNode)) {
    throw new Error('Not implemented isIndexedAccessTypeNode')
    // return { typeName: 'void' }
    // TODO: return getIndexAccessType(typeNode)
  }

  if (ts.isTypeOperatorNode(typeNode)) {
    return { typeName: 'void' }
    // TODO: return getKeyofType(typeNode)
  }

  if (ts.isMappedTypeNode(typeNode)) {
    throw new Error('Not implemented isMappedTypeNode')
    // return { typeName: 'void' }
    // TODO: return getMapperType(typeNode)
  }

  if (ts.isLiteralTypeNode(typeNode)) {
    throw new Error('Not implemented isLiteralTypeNode')
    // return { typeName: 'void' }
    // TODO: return getMapperType(typeNode)
  }

  if (ts.isTypeReferenceNode(typeNode)) {
    const typeReference = typeNode
    const typeName = resolveSimpleTypeName(typeReference.typeName)

    if (typeName === 'Date') {
      return getDateType(typeNode)
    }
    if (typeName === 'Buffer') {
      return { typeName: 'buffer' }
    }
    if (typeName === 'DownloadBinaryData') {
      return { typeName: 'buffer' }
    }
    if (typeName === 'DownloadResource') {
      return { typeName: 'buffer' }
    }

    const enumType = getEnumerateType(typeNode)
    if (enumType !== undefined) {
      return enumType
    }

    try {
      const literalType = getLiteralType(typeNode)
      if (literalType !== undefined) {
        return literalType
      }
    } catch (e) {}

    return { typeName: 'void' }
  }

  if (isNodeWithTypeArguments(typeNode)) {
    if (
      typeNode.typeArguments === undefined ||
      typeNode.typeArguments.length === 0
    ) {
      return { typeName: 'void' }
    }
    const typeReference = typeNode.typeArguments[0]
    if (isSupportedType(typeReference)) {
      return resolveType(typeReference, genericTypeMap)
    } else {
      throw new Error(
        `Unknown type: ${
          ts.SyntaxKind[typeReference.kind]
        } inside nodeWithArgumentType: ${typeNode.getText()}`
      )
    }
  }
  throw new Error(
    'No es de ningun tipo soportado: ' +
      `Unknown type: ${ts.SyntaxKind[typeNode.kind]}: ${typeNode.getText()}`
  )
  // return { typeName: 'void' }
  // return { typeName: 'void' }
}

function getPrimitiveType(typeNode: ts.TypeNode): Type | undefined {
  const primitiveType = syntaxKindMap[typeNode.kind]
  if (primitiveType === undefined) {
    return undefined
  }

  if (primitiveType === 'number') {
    const parentNode = typeNode.parent
    if (parentNode === undefined) {
      return { typeName: 'double' }
    }

    const validDecorators = ['IsInt', 'IsLong', 'IsFloat', 'IsDouble']

    // Can't use decorators on interface/type properties, so support getting the type from jsdoc too.
    const jsdocTagName = getFirstMatchingJSDocTagName(parentNode, (tag) => {
      return validDecorators.some((t) => t === tag.tagName.text)
    })

    const decoratorName = getDecoratorName(parentNode, (identifier) => {
      return validDecorators.some((m) => m === identifier.text)
    })

    switch (decoratorName ?? jsdocTagName) {
      case 'IsInt':
        return { typeName: 'integer' }
      case 'IsLong':
        return { typeName: 'long' }
      case 'IsFloat':
        return { typeName: 'float' }
      case 'IsDouble':
        return { typeName: 'double' }
      default:
        return { typeName: 'double' }
    }
  }
  return { typeName: primitiveType }
}

function getDateType(typeNode: ts.TypeNode): Type {
  const parentNode = typeNode.parent
  if (parentNode === undefined) {
    return { typeName: 'datetime' }
  }
  const decoratorName = getDecoratorName(parentNode, (identifier) => {
    return ['IsDate', 'IsDateTime'].some((m) => m === identifier.text)
  })
  switch (decoratorName) {
    case 'IsDate':
      return { typeName: 'date' }
    case 'IsDateTime':
      return { typeName: 'datetime' }
    default:
      return { typeName: 'datetime' }
  }
}

function getEnumerateType(
  typeNode: ts.TypeReferenceNode
): EnumerateType | undefined {
  const enumName = typeNode.typeName.getText()
  const enumTypes = MetadataGenerator.current.nodes
    .filter((node) => node.kind === ts.SyntaxKind.EnumDeclaration)
    .filter((node) => (node as any).name.text === enumName)

  if (enumTypes.length === 0) {
    return undefined
  }
  if (enumTypes.length > 1) {
    throw new Error(
      `Multiple matching enum found for enum ${enumName}; please make enum names unique.`
    )
  }

  const enumDeclaration = enumTypes[0] as ts.EnumDeclaration

  return {
    enumMembers: enumDeclaration.members.map((member, index) => {
      return member.name.getText() ?? index
    }),
    typeName: 'enum'
  }
}

function getUnionType(typeNode: ts.UnionTypeNode): EnumerateType {
  const union = typeNode
  let baseType: any = null
  let isObject = false
  union.types.forEach((type) => {
    if (baseType === null) {
      baseType = type
    }
    if (baseType.kind !== type.kind) {
      isObject = true
    }
  })
  if (isObject) {
    return {
      enumMembers: [],
      typeName: 'object'
    }
  }
  return {
    enumMembers: union.types.map((type, index) => {
      return type.getText() === '' ? `${index}` : removeQuotes(type.getText())
    }),
    typeName: 'enum'
  }
}

function removeQuotes(str: string): string {
  return str.replace(/^["']|["']$/g, '')
}
function getLiteralType(
  typeNode: ts.TypeReferenceNode
): EnumerateType | undefined {
  const literalName = typeNode.typeName.getText()
  const aliasDeclarationsList = MetadataGenerator.current.nodes.filter((node) =>
    ts.isTypeAliasDeclaration(node)
  ) as ts.TypeAliasDeclaration[]
  const unionTypeList = aliasDeclarationsList.filter((node) => {
    const innerType = node.type
    return ts.isUnionTypeNode(innerType)
  })
  const literalNamesList = unionTypeList.filter(
    (node) => node.name.text === literalName
  )

  if (literalNamesList.length === 0) {
    return undefined
  }
  if (literalNamesList.length > 1) {
    throw new Error(
      `Multiple matching enum found for enum ${literalName}; please make enum names unique.`
    )
  }

  const unionTypes = (literalNamesList[0].type as ts.UnionTypeNode).types
  return {
    enumMembers: unionTypes.map((unionNode) => {
      if (ts.isLiteralTypeNode(unionNode)) {
        return unionNode.literal.getText()
      } else {
        throw new Error(
          `Invalid enum: value ${unionNode.getText()} is not a literal node`
        )
      }
    }),
    typeName: 'enum'
  }
}

function getInlineObjectType(typeNode: ts.TypeLiteralNode): ObjectType {
  const type: ObjectType = {
    properties: getModelTypeProperties(typeNode),
    typeName: ''
  }
  return type
}

function getReferenceType(
  type: ts.EntityName,
  genericTypeMap?: Map<String, ts.TypeNode>,
  genericTypes?: ts.TypeNode[]
): ReferenceType {
  let typeName = resolveFqTypeName(type)
  if (genericTypeMap?.has(typeName)) {
    const refType: any = genericTypeMap.get(typeName)
    type = refType.typeName as ts.EntityName
    typeName = resolveFqTypeName(type)
  }
  const typeNameWithGenerics = getTypeName(typeName, genericTypes)

  try {
    const existingType = localReferenceTypeCache[typeNameWithGenerics]
    if (existingType) {
      return existingType
    }

    if (inProgressTypes[typeNameWithGenerics]) {
      return createCircularDependencyResolver(typeNameWithGenerics)
    }

    inProgressTypes[typeNameWithGenerics] = true

    const modelTypeDeclaration = getModelTypeDeclaration(type)

    const properties = getModelTypeProperties(
      modelTypeDeclaration,
      genericTypes
    )
    const additionalProperties =
      getModelTypeAdditionalProperties(modelTypeDeclaration)

    const referenceType: ReferenceType = {
      description: getModelDescription(modelTypeDeclaration),
      properties,
      typeName: typeNameWithGenerics
    }
    if (additionalProperties && additionalProperties.length > 0) {
      referenceType.additionalProperties = additionalProperties
    }

    const extendedProperties = getInheritedProperties(
      modelTypeDeclaration,
      genericTypes
    )
    mergeReferenceTypeProperties(referenceType.properties, extendedProperties)

    localReferenceTypeCache[typeNameWithGenerics] = referenceType

    return referenceType
  } catch (err) {
    console.error(
      `There was a problem resolving type of '${getTypeName(
        typeName,
        genericTypes
      )}'.`
    )
    throw err
  }
}

function mergeReferenceTypeProperties(
  properties: Property[],
  extendedProperties: Property[]
): void {
  extendedProperties.forEach((prop) => {
    const existingProp = properties.find((p) => p.name === prop.name)
    if (existingProp) {
      existingProp.description = existingProp.description || prop.description
    } else {
      properties.push(prop)
    }
  })
}

function resolveFqTypeName(type: ts.EntityName): string {
  if (type.kind === ts.SyntaxKind.Identifier) {
    return type.text
  }

  const qualifiedType = type
  return resolveFqTypeName(qualifiedType.left) + '.' + qualifiedType.right.text
}

function resolveSimpleTypeName(type: ts.EntityName): string {
  if (ts.isIdentifier(type)) {
    return type.text
  }
  const qualifiedType = type
  return qualifiedType.right.text
}

function getTypeName(typeName: string, genericTypes?: ts.TypeNode[]): string {
  if (!genericTypes || genericTypes.length === 0) {
    return typeName
  }
  return typeName + genericTypes.map((t) => getAnyTypeName(t)).join('')
}

function getAnyTypeName(typeNode: ts.TypeNode): string {
  const primitiveType = syntaxKindMap[typeNode.kind]
  if (primitiveType) {
    return primitiveType
  }

  if (typeNode.kind === ts.SyntaxKind.ArrayType) {
    const arrayType = typeNode as ts.ArrayTypeNode
    return getAnyTypeName(arrayType.elementType) + 'Array'
  }

  if (
    typeNode.kind === ts.SyntaxKind.UnionType ||
    typeNode.kind === ts.SyntaxKind.AnyKeyword
  ) {
    return 'object'
  }

  if (typeNode.kind !== ts.SyntaxKind.TypeReference) {
    throw new Error(`Unknown type: ${ts.SyntaxKind[typeNode.kind]}`)
  }

  const typeReference = typeNode as ts.TypeReferenceNode
  try {
    const typeName = (typeReference.typeName as ts.Identifier).text
    if (
      typeName === 'Array' &&
      typeReference.typeArguments &&
      typeReference.typeArguments.length > 0
    ) {
      return getAnyTypeName(typeReference.typeArguments[0]) + 'Array'
    }
    return typeName
  } catch (e) {
    // idk what would hit this? probably needs more testing
    console.error(e)
    return typeNode.getText()
  }
}

function createCircularDependencyResolver(typeName: string): {
  description: string
  properties: Property[]
  typeName: string
} {
  const referenceType = {
    description: '',
    properties: new Array<Property>(),
    typeName
  }

  MetadataGenerator.current.onFinish((referenceTypes) => {
    const realReferenceType = referenceTypes[typeName]
    if (!realReferenceType) {
      return
    }
    referenceType.description = realReferenceType.description
    referenceType.properties = realReferenceType.properties
    referenceType.typeName = realReferenceType.typeName
  })

  return referenceType
}

function nodeIsUsable(node: ts.Node): boolean {
  switch (node.kind) {
    case ts.SyntaxKind.InterfaceDeclaration:
    case ts.SyntaxKind.ClassDeclaration:
    case ts.SyntaxKind.TypeAliasDeclaration:
      return true
    default:
      return false
  }
}

function resolveLeftmostIdentifier(type: ts.EntityName): ts.Identifier {
  while (type.kind !== ts.SyntaxKind.Identifier) {
    type = type.left
  }
  return type
}

function resolveModelTypeScope(
  leftmost: ts.EntityName,
  statements: any[]
): any[] {
  // while (leftmost.parent && leftmost.parent.kind === ts.SyntaxKind.QualifiedName) {
  //     const leftmostName = leftmost.kind === ts.SyntaxKind.Identifier
  //         ? (leftmost as ts.Identifier).text
  //         : (leftmost as ts.QualifiedName).right.text;
  //     const moduleDeclarations = statements
  //         .filter(node => {
  //             if (node.kind === ts.SyntaxKind.ModuleDeclaration) {
  //                 const moduleDeclaration = node as ts.ModuleDeclaration;
  //                 return (moduleDeclaration.name as ts.Identifier).text.toLowerCase() === leftmostName.toLowerCase();
  //             }
  //             return false;
  //         }) as Array<ts.ModuleDeclaration>;

  //     if (!moduleDeclarations.length) { throw new Error(`No matching module declarations found for ${leftmostName}`); }
  //     if (moduleDeclarations.length > 1) { throw new Error(`Multiple matching module declarations found for ${leftmostName}; please make module declarations unique`); }

  //     const moduleBlock = moduleDeclarations[0].body as ts.ModuleBlock;
  //     if (moduleBlock === null || moduleBlock.kind !== ts.SyntaxKind.ModuleBlock) { throw new Error(`Module declaration found for ${leftmostName} has no body`); }

  //     statements = moduleBlock.statements;
  //     leftmost = leftmost.parent as ts.EntityName;
  // }

  return statements
}

function getModelTypeDeclaration(type: ts.EntityName): UsableDeclaration {
  const leftmostIdentifier = resolveLeftmostIdentifier(type)
  const statements: any[] = resolveModelTypeScope(
    leftmostIdentifier,
    MetadataGenerator.current.nodes
  )

  const typeName =
    type.kind === ts.SyntaxKind.Identifier ? type.text : type.right.text
  const modelTypes = statements.filter((node) => {
    if (!nodeIsUsable(node)) {
      return false
    }

    const modelTypeDeclaration = node as UsableDeclaration
    return modelTypeDeclaration.name !== undefined
      ? modelTypeDeclaration.name.text === typeName
      : false
  }) as UsableDeclaration[]

  if (modelTypes.length === 0) {
    throw new Error(`No matching model found for referenced type ${typeName}`)
  }
  // if (modelTypes.length > 1) {
  //     const conflicts = modelTypes.map(modelType => modelType.getSourceFile().fileName).join('"; "');
  //     throw new Error(`Multiple matching models found for referenced type ${typeName}; please make model names unique. Conflicts found: "${conflicts}"`);
  // }

  return modelTypes[0]
}

function getModelTypeProperties(
  node: any,
  genericTypes?: ts.TypeNode[]
): Property[] {
  if (
    node.kind === ts.SyntaxKind.TypeLiteral ||
    node.kind === ts.SyntaxKind.InterfaceDeclaration
  ) {
    const interfaceDeclaration = node as ts.InterfaceDeclaration
    return interfaceDeclaration.members
      .filter((member) => {
        if (
          (member as any).type &&
          (member as any).type.kind === ts.SyntaxKind.FunctionType
        ) {
          return false
        }
        return member.kind === ts.SyntaxKind.PropertySignature
      })
      .map((member: any) => {
        const propertyDeclaration = member as ts.PropertyDeclaration
        const identifier = propertyDeclaration.name as ts.Identifier

        if (!propertyDeclaration.type) {
          throw new Error('No valid type found for property declaration.')
        }

        // Declare a variable that can be overridden if needed
        let aType = propertyDeclaration.type

        // aType.kind will always be a TypeReference when the property of Interface<T> is of type T
        if (
          aType.kind === ts.SyntaxKind.TypeReference &&
          genericTypes &&
          genericTypes.length > 0 &&
          node.typeParameters
        ) {
          // The type definitions are conviently located on the object which allow us to map -> to the genericTypes
          const typeParams = _.map(
            node.typeParameters,
            (typeParam: ts.TypeParameterDeclaration) => {
              return typeParam.name.text
            }
          )

          // I am not sure in what cases
          const typeIdentifier = (aType as ts.TypeReferenceNode).typeName
          let typeIdentifierName: string

          // typeIdentifier can either be a Identifier or a QualifiedName
          if ((typeIdentifier as ts.Identifier).text) {
            typeIdentifierName = (typeIdentifier as ts.Identifier).text
          } else {
            typeIdentifierName = (typeIdentifier as ts.QualifiedName).right.text
          }

          // I could not produce a situation where this did not find it so its possible this check is irrelevant
          const indexOfType = _.indexOf<string>(typeParams, typeIdentifierName)
          if (indexOfType >= 0) {
            aType = genericTypes[indexOfType]
          }
        }

        return {
          description: getNodeDescription(propertyDeclaration),
          name: identifier.text,
          required: !propertyDeclaration.questionToken,
          type: resolveType(aType)
        }
      })
  }

  if (node.kind === ts.SyntaxKind.TypeAliasDeclaration) {
    const typeAlias = node as ts.TypeAliasDeclaration

    return !keywords.includes(typeAlias.type.kind)
      ? getModelTypeProperties(typeAlias.type, genericTypes)
      : []
  }

  const classDeclaration = node as ts.ClassDeclaration

  let properties = classDeclaration.members
    ? (classDeclaration.members.filter((member: any) => {
        if (member.kind !== ts.SyntaxKind.PropertyDeclaration) {
          return false
        }

        const propertySignature = member as ts.PropertySignature
        return propertySignature && hasPublicMemberModifier(propertySignature)
      }) as Array<ts.PropertyDeclaration | ts.ParameterDeclaration>)
    : []

  const classConstructor = classDeclaration.members
    ? (classDeclaration.members.find(
        (member: any) => member.kind === ts.SyntaxKind.Constructor
      ) as ts.ConstructorDeclaration)
    : null
  if (classConstructor?.parameters) {
    properties = properties.concat(
      classConstructor.parameters.filter((parameter) =>
        hasPublicConstructorModifier(parameter)
      ) as any
    )
  }

  return properties.map((declaration) => {
    const identifier = declaration.name as ts.Identifier

    if (!declaration.type) {
      throw new Error('No valid type found for property declaration.')
    }

    return {
      description: getNodeDescription(declaration),
      name: identifier.text,
      required: !declaration.questionToken,
      type: resolveType(
        resolveTypeParameter(declaration.type, classDeclaration, genericTypes)
      )
    }
  })
}

function resolveTypeParameter(
  type: any,
  classDeclaration: ts.ClassDeclaration,
  genericTypes?: ts.TypeNode[]
): ts.TypeNode {
  if (
    genericTypes &&
    classDeclaration.typeParameters &&
    classDeclaration.typeParameters.length
  ) {
    for (let i = 0; i < classDeclaration.typeParameters.length; i++) {
      if (
        type.typeName !== undefined &&
        classDeclaration.typeParameters[i].name.text === type.typeName.text
      ) {
        return genericTypes[i]
      }
    }
  }
  return type
}

function getModelTypeAdditionalProperties(node: UsableDeclaration):
  | Array<{
      description: string
      name: string
      required: boolean
      type: ObjectType | ArrayType | Type
    }>
  | undefined {
  if (ts.isInterfaceDeclaration(node)) {
    const interfaceDeclaration = node
    return (
      interfaceDeclaration.members.filter((member) =>
        ts.isIndexSignatureDeclaration(member)
      ) as ts.IndexSignatureDeclaration[]
    ).map((member) => {
      const indexSignatureDeclaration = member

      const indexType = resolveType(
        indexSignatureDeclaration.parameters[0].type
      )
      if (indexType.typeName !== 'string') {
        throw new Error(
          `Only string indexers are supported. Found ${indexType.typeName}.`
        )
      }

      return {
        description: '',
        name: '',
        required: true,
        type: resolveType(indexSignatureDeclaration.type)
      }
    })
  }

  return undefined
}

function hasPublicMemberModifier(node: ts.PropertySignature): boolean {
  return (
    !node.modifiers ||
    node.modifiers.every((modifier) => {
      return (
        modifier.kind !== ts.SyntaxKind.ProtectedKeyword &&
        modifier.kind !== ts.SyntaxKind.PrivateKeyword
      )
    })
  )
}

function hasPublicConstructorModifier(
  node: ts.ParameterDeclaration
): boolean | undefined {
  return node.modifiers?.some((modifier) => {
    return modifier.kind === ts.SyntaxKind.PublicKeyword
  })
}

function getInheritedProperties(
  modelTypeDeclaration: UsableDeclaration,
  genericTypes?: ts.TypeNode[]
): Property[] {
  const properties = new Array<Property>()
  if (modelTypeDeclaration.kind === ts.SyntaxKind.TypeAliasDeclaration) {
    return []
  }
  const heritageClauses = modelTypeDeclaration.heritageClauses
  if (!heritageClauses) {
    return properties
  }

  heritageClauses.forEach((clause) => {
    if (!clause.types) {
      return
    }

    clause.types.forEach((t) => {
      let type: any = MetadataGenerator.current.getClassDeclaration(
        t.expression.getText()
      )
      if (!type) {
        type = MetadataGenerator.current.getInterfaceDeclaration(
          t.expression.getText()
        )
      }
      if (!type) {
        throw new Error(`No type found for ${t.expression.getText()}`)
      }
      const baseEntityName = t.expression as ts.EntityName
      const parentGenerictypes = resolveTypeArguments(
        modelTypeDeclaration as ts.ClassDeclaration,
        genericTypes
      )
      const genericTypeMap = resolveTypeArguments(
        type,
        t.typeArguments,
        parentGenerictypes
      )
      const subClassGenericTypes = getSubClassGenericTypes(
        genericTypeMap,
        t.typeArguments
      )
      getReferenceType(
        baseEntityName,
        genericTypeMap,
        subClassGenericTypes
      ).properties.forEach((property) => properties.push(property))
    })
  })

  return properties
}

function getModelDescription(modelTypeDeclaration: UsableDeclaration): string {
  return getNodeDescription(modelTypeDeclaration)
}

function getNodeDescription(
  node: UsableDeclaration | ts.PropertyDeclaration | ts.ParameterDeclaration
): string {
  const symbol = MetadataGenerator.current.typeChecker.getSymbolAtLocation(
    node.name as ts.Node
  )

  if (symbol) {
    /**
     * TODO: Workaround for what seems like a bug in the compiler
     * Warrants more investigation and possibly a PR against typescript
     */
    if (node.kind === ts.SyntaxKind.Parameter) {
      // TypeScript won't parse jsdoc if the flag is 4, i.e. 'Property'
      symbol.flags = 0
    }

    const comments = symbol.getDocumentationComment(
      MetadataGenerator.current.typeChecker
    )
    if (comments.length > 0) {
      return ts.displayPartsToString(comments)
    }
  }

  return ''
}

function getSubClassGenericTypes(
  genericTypeMap?: Map<String, ts.TypeNode>,
  typeArguments?: ts.NodeArray<ts.TypeNode>
): ts.TypeNode[] | undefined {
  if (genericTypeMap !== undefined && typeArguments !== undefined) {
    const result: ts.TypeNode[] = []
    typeArguments.forEach((t: any) => {
      const typeName = getAnyTypeName(t)
      const value = genericTypeMap.get(typeName)
      if (genericTypeMap.has(typeName) && value !== undefined) {
        result.push(value)
      } else {
        result.push(t)
      }
    })
    return result
  }
  return undefined
}

export function getSuperClass(
  node: ts.ClassDeclaration,
  typeArguments?: Map<String, ts.TypeNode>
):
  | {
      type: ts.TypeNode
      typeArguments: Map<String, ts.TypeNode>
    }
  | undefined {
  const clauses = node.heritageClauses
  if (clauses) {
    const filteredClauses = clauses.filter(
      (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword
    )
    if (filteredClauses.length > 0) {
      const clause: ts.HeritageClause = filteredClauses[0]
      if (clause.types?.length) {
        const type: any = MetadataGenerator.current.getClassDeclaration(
          clause.types[0].expression.getText()
        )
        return {
          type,
          typeArguments: resolveTypeArguments(
            type,
            clause.types[0].typeArguments,
            typeArguments
          )
        }
      }
    }
  }
  return undefined
}

function buildGenericTypeMap(
  node: ts.ClassDeclaration,
  typeArguments?: readonly ts.TypeNode[]
): Map<String, ts.TypeNode> {
  const result: Map<String, ts.TypeNode> = new Map<String, ts.TypeNode>()
  if (node.typeParameters && typeArguments) {
    node.typeParameters.forEach((typeParam, index) => {
      const paramName = typeParam.name.text
      result.set(paramName, typeArguments[index])
    })
  }
  return result
}

function resolveTypeArguments(
  node: ts.ClassDeclaration,
  typeArguments?: readonly ts.TypeNode[],
  parentTypeArguments?: Map<String, ts.TypeNode>
): Map<String, ts.TypeNode> {
  const result = buildGenericTypeMap(node, typeArguments)
  if (parentTypeArguments) {
    result.forEach((value: any, key) => {
      const typeName = getAnyTypeName(value)
      const value2 = parentTypeArguments.get(typeName)
      if (value2 !== undefined) {
        result.set(key, value2)
      }
    })
  }
  return result
}

/**
 * Used to identify union types of a primitive and array of the same primitive, e.g. `string | string[]`
 */
export function getCommonPrimitiveAndArrayUnionType(
  typeNode?: ts.TypeNode
): Type | null {
  if (typeNode && typeNode.kind === ts.SyntaxKind.UnionType) {
    const union = typeNode as ts.UnionTypeNode
    const types = union.types.map((t) => resolveType(t))
    const arrType = types.find((t) => t.typeName === 'array') as
      | ArrayType
      | undefined
    const primitiveType = types.find((t) => t.typeName !== 'array')

    if (
      types.length === 2 &&
      arrType &&
      arrType.elementType &&
      primitiveType &&
      arrType.elementType.typeName === primitiveType.typeName
    ) {
      return arrType
    }
  }

  return null
}

export function getLiteralValue(expression: ts.Expression): any {
  if (expression.kind === ts.SyntaxKind.StringLiteral) {
    return (expression as ts.StringLiteral).text
  }
  if (expression.kind === ts.SyntaxKind.NumericLiteral) {
    return parseFloat((expression as ts.NumericLiteral).text)
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return true
  }
  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return false
  }
  if (expression.kind === ts.SyntaxKind.ArrayLiteralExpression) {
    return (expression as ts.ArrayLiteralExpression).elements.map((e) =>
      getLiteralValue(e)
    )
  }
}
