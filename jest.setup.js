globalThis.DogfoodMembrane = undefined; // TODO: we might have to make this a part of the code itself, not just the tests - check on this.

// The es-membrane tests were originally written for jasmine, which provides a global fail function (unlike jest).
globalThis.fail = (error) => {
    throw new Error(error);
}

