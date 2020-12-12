"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_1 = require("graphql");
const values_1 = require("graphql/execution/values");
function printDependencyGraph(root) {
    const allVertices = [];
    const edges = [];
    traverseFieldVertices(root, vertex => {
        allVertices.push(vertex);
        for (const dependOnMe of vertex.dependOnMe) {
            let conditional = false;
            if (vertex.fieldDefinition) {
                const toType = graphql_1.getNamedType(vertex.fieldDefinition.type);
                conditional = dependOnMe.objectType !== toType;
            }
            edges.push({ from: dependOnMe, to: vertex, conditional });
        }
    });
    return [allVertices, edges];
}
exports.printDependencyGraph = printDependencyGraph;
function traverseFieldVertices(root, visitor) {
    const traverserState = [];
    traverserState.push(root);
    while (traverserState.length > 0) {
        const curVertex = traverserState.pop();
        visitor(curVertex);
        const children = curVertex.dependOnMe;
        children.forEach(child => {
            traverserState.push(child);
        });
    }
}
exports.traverseFieldVertices = traverseFieldVertices;
function analyzeQuery(document, schema, rawVariableValues, validateQuery = true) {
    if (validateQuery) {
        const errors = graphql_1.validate(schema, document);
        if (errors.length > 0) {
            throw errors[0];
        }
    }
    const operationDefinition = getOperationDefinition(document);
    const variableDefinitions = operationDefinition.variableDefinitions
        || [];
    const coercedVariableValues = values_1.getVariableValues(schema, variableDefinitions, rawVariableValues || {});
    const fragments = getFragments(document);
    const context = {
        fragments,
        schema,
        variableValues: coercedVariableValues.coerced ? coercedVariableValues.coerced : {}
    };
    const roots = collectFieldsFromOperation(context, operationDefinition, schema.getQueryType());
    const getChildren = mergedField => {
        return collectFields(context, mergedField);
    };
    const dummyRootFieldVertex = {
        id: "0",
        objectType: null,
        fields: null,
        dependOnMe: [],
        dependsOn: [],
        fieldDefinition: null,
        toString() {
            return "ROOT";
        }
    };
    const allVertices = [];
    let vertexId = 1;
    const visitor = (context) => {
        const mergedField = context.mergedField;
        const newFieldVertex = {
            id: (vertexId++).toString(),
            fields: mergedField.fields,
            objectType: mergedField.objectType,
            fieldDefinition: mergedField.fieldDefinition,
            dependsOn: [context.parentContext.fieldVertex],
            dependOnMe: [],
            toString() {
                return this.objectType.name + "." + this.fields[0].name.value + ": " +
                    this.fieldDefinition.type;
            }
        };
        context.parentContext.fieldVertex.dependOnMe.push(newFieldVertex);
        context.fieldVertex = newFieldVertex;
        allVertices.push(newFieldVertex);
    };
    depthFirstVisit(roots, dummyRootFieldVertex, getChildren, visitor);
    return dummyRootFieldVertex;
}
exports.analyzeQuery = analyzeQuery;
function mergedFieldToString(mergedField) {
    if (!mergedField) {
        return "merged field null";
    }
    return mergedField.objectType.name + "." + getFieldEntryKey(mergedField.fields[0]);
}
function vertexToString(fieldVertex) {
    if (!fieldVertex.objectType) {
        return "ROOT VERTEX";
    }
    return fieldVertex.objectType.name + "." + getFieldEntryKey(fieldVertex.fields[0]) +
        " -> " + fieldVertex.dependsOn.map(dependency => vertexToString(dependency));
}
function depthFirstVisit(roots, rootFieldVertex, getChildren, visitor) {
    const traverserState = [];
    const dummyRootContext = {
        mergedField: null,
        fieldVertex: rootFieldVertex,
        parentContext: null
    };
    roots.forEach(mergedField => {
        traverserState.push({ mergedField, fieldVertex: rootFieldVertex, parentContext: dummyRootContext });
    });
    while (traverserState.length > 0) {
        const curContext = traverserState.pop();
        visitor(curContext);
        const children = getChildren(curContext.mergedField);
        children.forEach(child => {
            const newContext = {
                parentContext: curContext,
                mergedField: child,
            };
            traverserState.push(newContext);
        });
    }
}
function collectFieldsFromOperation(exeContext, operationDefinition, rootType) {
    const result = {};
    collectFieldsImpl(exeContext, operationDefinition.selectionSet, result, new Set([rootType]), {}, rootType);
    return toListOfMergedFields(result);
}
function collectFields(exeContext, mergedField) {
    const result = {};
    const parentType = graphql_1.getNamedType(mergedField.fieldDefinition.type);
    if (!(graphql_1.isCompositeType(parentType))) {
        return [];
    }
    const possibleTypes = getPossibleTypes(exeContext, parentType);
    for (const field of mergedField.fields) {
        collectFieldsImpl(exeContext, field.selectionSet, result, possibleTypes, {}, parentType);
    }
    return toListOfMergedFields(result);
}
function toListOfMergedFields(map) {
    const mergedFields = [];
    const listOfMaps = Object.values(map);
    listOfMaps.forEach(mapByTypeName => Object.values(mapByTypeName).forEach(mergedField => {
        mergedFields.push(mergedField);
    }));
    return mergedFields;
}
function collectFieldsImpl(exeContext, selectionSet, result, possibleObjectTypes, visitedFragmentNames, parentType) {
    for (let i = 0; i < selectionSet.selections.length; i++) {
        const selection = selectionSet.selections[i];
        switch (selection.kind) {
            case "Field": {
                collectField(exeContext, selection, result, possibleObjectTypes, visitedFragmentNames, parentType);
                break;
            }
            case "InlineFragment": {
                collectInlineFragment(exeContext, selection, result, possibleObjectTypes, visitedFragmentNames, parentType);
                break;
            }
            case "FragmentSpread": {
                collectFragmentSpread(exeContext, selection, result, possibleObjectTypes, visitedFragmentNames, parentType);
                break;
            }
        }
    }
}
function collectField(exeContext, field, result, possibleObjectTypes, visitedFragmentNames, parentType) {
    if (!shouldIncludeNode(exeContext, field)) {
        return;
    }
    if (field.name.value === graphql_1.TypeNameMetaFieldDef.name) {
        return;
    }
    const name = getFieldEntryKey(field);
    if (!result[name]) {
        result[name] = {};
    }
    const mergedFields = result[name];
    for (const possibleObject of possibleObjectTypes) {
        if (!mergedFields[possibleObject.name]) {
            const unwrappedParentType = graphql_1.getNamedType(parentType);
            const fieldDefinition = unwrappedParentType.getFields()[field.name.value];
            const newMergedField = {
                fields: [field],
                objectType: possibleObject,
                fieldDefinition
            };
            mergedFields[possibleObject.name] = newMergedField;
        }
        else {
            const existingMergedField = mergedFields[possibleObject.name];
            existingMergedField.fields.push(field);
        }
    }
}
function collectInlineFragment(exeContext, inlineFragment, result, possibleObjectTypes, visitedFragmentNames, parentType) {
    if (!shouldIncludeNode(exeContext, inlineFragment)) {
        return;
    }
    let newPossibleObjectTypes = possibleObjectTypes;
    let newParentType = parentType;
    if (inlineFragment.typeCondition) {
        newParentType = nonNull(exeContext.schema.getType(inlineFragment.typeCondition.name.value));
        newPossibleObjectTypes = narrowDownPossibleObjects(exeContext, possibleObjectTypes, newParentType);
        ;
    }
    collectFieldsImpl(exeContext, inlineFragment.selectionSet, result, newPossibleObjectTypes, visitedFragmentNames, newParentType);
}
function collectFragmentSpread(exeContext, fragmentSpread, result, possibleObjectTypes, visitedFragmentNames, parentType) {
    const fragName = fragmentSpread.name.value;
    if (visitedFragmentNames[fragName] || !shouldIncludeNode(exeContext, fragmentSpread)) {
        return;
    }
    visitedFragmentNames[fragName] = true;
    const fragment = exeContext.fragments[fragName];
    const newParentType = exeContext.schema.getType(fragment.typeCondition.name.value);
    const newPossibleObjectTypes = narrowDownPossibleObjects(exeContext, possibleObjectTypes, newParentType);
    ;
    collectFieldsImpl(exeContext, fragment.selectionSet, result, newPossibleObjectTypes, visitedFragmentNames, newParentType);
}
function narrowDownPossibleObjects(exeContext, currentObjects, newCondition) {
    const resolvedObjects = getPossibleTypes(exeContext, newCondition);
    if (currentObjects.size == 0) {
        return new Set(resolvedObjects);
    }
    const result = new Set();
    for (const object of currentObjects) {
        if (resolvedObjects.has(object)) {
            result.add(object);
        }
    }
    return result;
}
function getPossibleTypes(exeContext, type) {
    if (type instanceof graphql_1.GraphQLObjectType) {
        return new Set([type]);
    }
    else if (type instanceof graphql_1.GraphQLInterfaceType || type instanceof graphql_1.GraphQLUnionType) {
        return new Set(exeContext.schema.getPossibleTypes(type));
    }
    else {
        throw new Error(`should not happen: type is ${type}`);
    }
}
function getFragments(document) {
    const fragments = {};
    for (let i = 0; i < document.definitions.length; i++) {
        const definition = document.definitions[i];
        switch (definition.kind) {
            case "FragmentDefinition":
                fragments[definition.name.value] = definition;
                break;
        }
    }
    return fragments;
}
function getOperationDefinition(document) {
    let result = null;
    for (let i = 0; i < document.definitions.length; i++) {
        const definition = document.definitions[i];
        switch (definition.kind) {
            case "OperationDefinition":
                if (result != null) {
                    throw new Error("more than one operation found");
                }
                result = definition;
                break;
        }
    }
    if (result) {
        return result;
    }
    else {
        throw new Error("no operation found");
    }
}
function getFieldEntryKey(node) {
    return node.alias ? node.alias.value : node.name.value;
}
function shouldIncludeNode(exeContext, node) {
    const skip = getDirectiveValues(graphql_1.GraphQLSkipDirective, node, exeContext.variableValues);
    if (skip && skip.if === true) {
        return false;
    }
    const include = getDirectiveValues(graphql_1.GraphQLIncludeDirective, node, exeContext.variableValues);
    if (include && include.if === false) {
        return false;
    }
    return true;
}
function getDirectiveValues(directiveDef, node, variableValues) {
    const directiveNode = node.directives &&
        node.directives.find(directive => directive.name.value === directiveDef.name);
    if (directiveNode) {
        return values_1.getArgumentValues(directiveDef, directiveNode, variableValues);
    }
}
function invariant(condition, message) {
    const booleanCondition = Boolean(condition);
    if (!booleanCondition) {
        throw new Error(message);
    }
}
function nonNull(object) {
    if (!object) {
        throw new Error('expected non null/undefined');
    }
    return object;
}
//# sourceMappingURL=index.js.map