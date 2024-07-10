import { ImportedThing } from "./importedThing";
import { Membrane } from "../src";

it("does something with ImportedThing", () => {
    const importedThing = new ImportedThing();
    expect(importedThing.foo).toBe("bar");
});

it("can import Membrane", () => {
    const myMembrane = new Membrane();
    expect(myMembrane).toBeDefined();
})