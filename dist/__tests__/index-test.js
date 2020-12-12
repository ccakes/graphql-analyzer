"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const graphql_1 = require("graphql");
const index_1 = require("../index");
describe('analyze', () => {
    const schema = graphql_1.buildSchema(`
    type Query {
        dog: Dog  
        cat: Cat
        animals: [Animal]
        pets: [CatOrDog]
    }
    union CatOrDog = Cat | Dog

    interface Animal{
        name: String
    }
    type Dog implements Animal{
        name: String
        id: ID
    }
    type Cat implements Animal{
        name: String
    }
    `);
    it('simple query', () => {
        const query = `
        { 
            dog {
                name
            }
        }`;
        const document = graphql_1.parse(query);
        const rootVertex = index_1.analyzeQuery(document, schema);
        const [allVertices, allEdges] = index_1.printDependencyGraph(rootVertex);
        chai_1.expect(allEdges).to.be.lengthOf(2);
        const edgesString = allEdges.map(edge => edge.from.toString() + ' -> ' + edge.to.toString());
        chai_1.expect(edgesString).to.contain('Query.dog: Dog -> ROOT');
        chai_1.expect(edgesString).to.contain('Dog.name: String -> Query.dog: Dog');
    });
    it('inline fragments on interface', () => {
        const query = `
        { 
            animals {
                name
                ... on Dog {
                    name
                }
                ... on Cat {
                    name
                }
            }
        }`;
        const document = graphql_1.parse(query);
        const rootVertex = index_1.analyzeQuery(document, schema);
        const [allVertices, allEdges] = index_1.printDependencyGraph(rootVertex);
        chai_1.expect(allEdges).to.be.lengthOf(3);
        const edgesString = allEdges.map(edge => edge.from.toString() + ' -> ' + edge.to.toString());
        chai_1.expect(edgesString).to.contain('Query.animals: [Animal] -> ROOT');
        chai_1.expect(edgesString).to.contain('Dog.name: String -> Query.animals: [Animal]');
        chai_1.expect(edgesString).to.contain('Cat.name: String -> Query.animals: [Animal]');
    });
    it('fragment on interface', () => {
        const query = `
        { 
            animals {
                ...OnCat
            }
        }
        fragment OnCat on Cat{
            name
        }`;
        const document = graphql_1.parse(query);
        const rootVertex = index_1.analyzeQuery(document, schema);
        const [allVertices, allEdges] = index_1.printDependencyGraph(rootVertex);
        chai_1.expect(allEdges).to.be.lengthOf(2);
        const edgesString = allEdges.map(edge => edge.from.toString() + ' -> ' + edge.to.toString());
        chai_1.expect(edgesString).to.contain('Query.animals: [Animal] -> ROOT');
        chai_1.expect(edgesString).to.contain('Cat.name: String -> Query.animals: [Animal]');
    });
    it('field on interface', () => {
        const query = `
        { 
            animals {
                name
            }
        }`;
        const document = graphql_1.parse(query);
        const rootVertex = index_1.analyzeQuery(document, schema);
        const [allVertices, allEdges] = index_1.printDependencyGraph(rootVertex);
        chai_1.expect(allEdges).to.be.lengthOf(3);
        const edgesString = allEdges.map(edge => edge.from.toString() + ' -> ' + edge.to.toString());
        chai_1.expect(edgesString).to.contain('Query.animals: [Animal] -> ROOT');
        chai_1.expect(edgesString).to.contain('Dog.name: String -> Query.animals: [Animal]');
        chai_1.expect(edgesString).to.contain('Cat.name: String -> Query.animals: [Animal]');
    });
    it('validation fails', () => {
        const query = `
        { 
            animals {
                illegalField
            }
        }`;
        const document = graphql_1.parse(query);
        chai_1.expect(() => index_1.analyzeQuery(document, schema)).to.be.throw();
    });
    it('__typename is ignored', () => {
        const query = `
        { 
            animals {
                __typename
            }
            pets {
                __typename
            }
        }`;
        const document = graphql_1.parse(query);
        const rootVertex = index_1.analyzeQuery(document, schema);
        const [allVertices, allEdges] = index_1.printDependencyGraph(rootVertex);
        chai_1.expect(allEdges).to.be.lengthOf(2);
        const edgesString = allEdges.map(edge => edge.from.toString() + ' -> ' + edge.to.toString());
        chai_1.expect(edgesString).to.contain('Query.animals: [Animal] -> ROOT');
        chai_1.expect(edgesString).to.contain('Query.pets: [CatOrDog] -> ROOT');
    });
    it('edge conditional info is correct', () => {
        const query = `
        { 
            animals {
                name
            }
            pets {
                ... on Cat {
                    name
                }
            }
            dog {
                name
            }
            cat {
                name
            }
        }`;
        const document = graphql_1.parse(query);
        const rootVertex = index_1.analyzeQuery(document, schema);
        const [allVertices, allEdges] = index_1.printDependencyGraph(rootVertex);
        chai_1.expect(allEdges).to.be.lengthOf(9);
        const edgesString = allEdges.map(edge => edge.from.toString() + ' -> ' + edge.to.toString() + ' conditional: ' + edge.conditional);
        chai_1.expect(edgesString).to.be.deep.equal(['Query.cat: Cat -> ROOT conditional: false',
            'Query.dog: Dog -> ROOT conditional: false',
            'Query.pets: [CatOrDog] -> ROOT conditional: false',
            'Query.animals: [Animal] -> ROOT conditional: false',
            'Cat.name: String -> Query.animals: [Animal] conditional: true',
            'Dog.name: String -> Query.animals: [Animal] conditional: true',
            'Cat.name: String -> Query.pets: [CatOrDog] conditional: true',
            'Dog.name: String -> Query.dog: Dog conditional: false',
            'Cat.name: String -> Query.cat: Cat conditional: false']);
    });
});
it('more complex query', () => {
    const schema = graphql_1.buildSchema(` type Query{ 
    a: [A]
    object: Object
}
type Object {
    someValue: String
}
interface A {
   b: B  
}
type A1 implements A {
   b: B 
}
type A2 implements A{
    b: B
}
interface B {
    leaf: String
}
type B1 implements B {
    leaf: String
} 
type B2 implements B {
    leaf: String
} `);
    const query = `{
    object{someValue}
    a {
      ... on A1 {
        b {
          ... on B {
            leaf
          }
          ... on B1 {
            leaf
          }
          ... on B2 {
            ... on B {
              leaf
            }
            leaf
            leaf
            ... on B2 {
              leaf
            }
          }
        }
      }
    }
  }`;
    const document = graphql_1.parse(query);
    const rootVertex = index_1.analyzeQuery(document, schema);
    const [allVertices, allEdges] = index_1.printDependencyGraph(rootVertex);
    chai_1.expect(allEdges).to.be.lengthOf(6);
    const edgesString = allEdges.map(edge => edge.from.toString() + ' -> ' + edge.to.toString());
    chai_1.expect(edgesString).to.be.deep.equal(['Query.a: [A] -> ROOT',
        'Query.object: Object -> ROOT',
        'Object.someValue: String -> Query.object: Object',
        'A1.b: B -> Query.a: [A]',
        'B2.leaf: String -> A1.b: B',
        'B1.leaf: String -> A1.b: B']);
});
//# sourceMappingURL=index-test.js.map