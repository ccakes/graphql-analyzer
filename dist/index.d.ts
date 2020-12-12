import { GraphQLSchema, GraphQLObjectType, FieldNode, GraphQLField, DocumentNode } from 'graphql';
export interface FieldVertex {
    id: string;
    fields: Array<FieldNode>;
    objectType: GraphQLObjectType;
    fieldDefinition: GraphQLField<any, any>;
    dependsOn: Array<FieldVertex>;
    dependOnMe: Array<FieldVertex>;
}
export interface DependencyEdge {
    from: FieldVertex;
    to: FieldVertex;
    conditional: boolean;
}
export declare function printDependencyGraph(root: FieldVertex): [Array<FieldVertex>, Array<DependencyEdge>];
export declare function traverseFieldVertices(root: FieldVertex, visitor: (vertex: FieldVertex) => void): void;
export declare function analyzeQuery(document: DocumentNode, schema: GraphQLSchema, rawVariableValues?: {
    [key: string]: any;
}, validateQuery?: boolean): FieldVertex;
