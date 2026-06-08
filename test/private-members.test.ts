////////////////////////////////////////////////////////////////////////////////////////////////////////////
// The inspiration for these tests were the problems with proxies pointed out by Rob Eisenberg            //
// in this article: https://eisenbergeffect.medium.com/the-prickly-case-of-javascript-proxies-b6c3833b738 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////

import { createMembraneProxy } from "./testUtils/createMembraneProxy";

const mockConsoleLog = jest.fn();

class Person {
  #firstName;
  #lastName;
  constructor(firstName: string, lastName: string) {
    this.#firstName = firstName;
    this.#lastName = lastName;
  }
  get firstName() {
    return this.#firstName;
  }
  get lastName() {
    return this.#lastName;
  }
  get fullName() {
    return `${this.firstName} ${this.lastName}`;
  }
  introduceYourselfTo(other = "friend") {
    mockConsoleLog(`Hello ${other}! My name is ${this.fullName}.`);
  }

  #buildGreeting() {
    return "Howdy!";
  }

  get greeting() {
    return this.#buildGreeting();
  }

  #cachedProxiedPerson: Person | null = null;

  #getProxiedPerson() {
    if (!this.#cachedProxiedPerson) {
      this.#cachedProxiedPerson = new Proxy(this, {
        get: (target, prop) => {
          const value = Reflect.get(target, prop, target);
          return value;
        }
      });
    }
    return this.#cachedProxiedPerson;
  }

  age = 10;

  get proxiedPerson() {
    return this.#getProxiedPerson();
  }
}

describe("Membranes that proxy classes with private members", () => {
  beforeEach(() => jest.resetAllMocks());

  it("throws when using Reflect.get() naively in a proxy trap", () => {
    const john = new Person("John", "Doe");
    const proxy = new Proxy(john, {
      get(target, property, receiver) {
        mockConsoleLog(`Access: "${String(property)}"`);
        return Reflect.get(target, property, receiver);
      }
    });
    expect(() => proxy.introduceYourselfTo("Jane")).toThrow(TypeError);
    expect(mockConsoleLog).toHaveBeenNthCalledWith(1, 'Access: "introduceYourselfTo"');
    expect(mockConsoleLog).toHaveBeenNthCalledWith(2, 'Access: "fullName"');
    expect(mockConsoleLog).toHaveBeenNthCalledWith(3, 'Access: "firstName"');
  });

  it("does not throw with es-membrane", () => {
    const dryPerson = new Person("John", "Doe");

    const { proxy: wetPerson } = createMembraneProxy(dryPerson);

    wetPerson.introduceYourselfTo("Jane"); // this has the potential to blow up if the Reflect calls within the proxy trap pass a receiver around unnecessarily.
    expect(mockConsoleLog).toHaveBeenCalledWith("Hello Jane! My name is John Doe.");
  });

  it("does not throw when accessing public getter that access a private method", () => {
    const dryPerson = new Person("John", "Doe");

    const { proxy: wetPerson } = createMembraneProxy(dryPerson);

    let greeting = wetPerson.greeting; // this has the potential to blow up if the Reflect calls within the proxy trap pass a receiver around unnecessarily.
    expect(greeting).toBe("Howdy!");
  });

  it("does not throw when accessing properties that return another proxy", () => {
    const dryPerson = new Person("John", "Doe");

    const { proxy: wetPerson } = createMembraneProxy(dryPerson);

    let wetPersonProxy = wetPerson.proxiedPerson;
    expect(wetPersonProxy.age).toBe(10);

    let wetPersonProxy2 = wetPersonProxy.proxiedPerson;
    expect(wetPersonProxy2.age).toBe(10);
  });

  it("same scenario as above, but without membrane", () => {
    const person = new Person("John", "Doe");

    let personProxy = person.proxiedPerson;
    expect(personProxy.age).toBe(10);

    let personProxy2 = personProxy.proxiedPerson;
    expect(personProxy2.age).toBe(10);
  });
});
