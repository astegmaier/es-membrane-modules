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
});
