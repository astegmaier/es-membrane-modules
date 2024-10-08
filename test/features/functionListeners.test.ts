import { MembraneMocks, loggerLib, DAMP } from "../../mocks";
import type { IMocks, IDampMocks } from "../../mocks";
import type { Membrane } from "../../src";

class TestMessage {
  constructor(
    public cbToken: string,
    public reason: string,
    public trapName: string,
    public fromField: symbol | string,
    public toField: symbol | string,
    public target: any,
    public rvOrExn: any
  ) {}

  expectEquals(other: TestMessage, _index: number) {
    let pass = other instanceof TestMessage;
    expect(pass).toBe(true);
    if (!pass) {
      return;
    }
    const keys = Reflect.ownKeys(this) as (keyof TestMessage)[];
    keys.forEach((key) => {
      let t = this[key],
        o = other[key];
      expect(t).toBe(o);
    }, this);
  }

  toString() {
    return JSON.stringify([
      this.cbToken,
      this.reason,
      this.trapName,
      this.fromField,
      this.toField,
      this.target.name,
      this.rvOrExn
    ]);
  }
}

describe("Function listeners", function () {
  "use strict";
  // Customize this for whatever variables you need.
  let parts: IMocks & IDampMocks, membrane: Membrane;
  const logger = loggerLib.getLogger("test.membrane.functionlisteners");
  const appender = new loggerLib.Appender();
  appender.setThreshold("INFO");
  logger.addAppender(appender);

  const mLogger = loggerLib.getLogger("test.membrane.errors");
  const mAppender = new loggerLib.Appender();
  mAppender.setThreshold("WARN");
  mLogger.addAppender(mAppender);

  function setParts() {
    membrane = parts.membrane;
  }

  beforeEach(function () {
    parts = MembraneMocks(true, mLogger);
    setParts();
    appender.clear();
    mAppender.clear();
  });

  function clearParts() {
    membrane.getHandlerByName("dry").revokeEverything();
    membrane = null as any;
    parts = null as any;
  }
  afterEach(clearParts);

  function fireInfo(
    cbToken: string,
    reason: string,
    trapName: string,
    fromField: symbol | string,
    toField: symbol | string,
    target: any,
    rvOrExn: any
  ) {
    var msg = new TestMessage(cbToken, reason, trapName, fromField, toField, target, rvOrExn);
    logger.info(msg);
    return appender.events.length;
  }

  const TestListeners = {
    wet0: fireInfo.bind(null, "wet0"),
    wet1: fireInfo.bind(null, "wet1"),

    dry0: fireInfo.bind(null, "dry0"),
    dry1: fireInfo.bind(null, "dry1"),

    damp: fireInfo.bind(null, "damp"),

    mem0: fireInfo.bind(null, "mem0"),
    mem1: fireInfo.bind(null, "mem1"),

    target: function atTarget() {
      return appender.events.length;
    }
  };

  function testMessageSequence(messages: TestMessage[]) {
    expect(messages.length).toBe(appender.events.length);
    if (messages.length === appender.events.length) {
      messages.forEach(function (m, index) {
        m.expectEquals(appender.events[index]!.message as TestMessage, index);
      });
    }
  }

  it("on an apply call and through cross-membrane callback functions", function () {
    // Event listeners, basically.
    parts.dry.doc.addEventListener("applyTest", TestListeners.target, false);

    parts.membrane.addFunctionListener(TestListeners.mem0);
    parts.membrane.addFunctionListener(TestListeners.mem1);

    parts.handlers.dry.addFunctionListener(TestListeners.dry0);
    parts.handlers.dry.addFunctionListener(TestListeners.dry1);

    parts.handlers.wet.addFunctionListener(TestListeners.wet0);
    parts.handlers.wet.addFunctionListener(TestListeners.wet1);

    parts.dry.doc.dispatchEvent("applyTest");

    const messages = [
      /* entering dispatchEvent */
      new TestMessage(
        "dry0",
        "enter",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.dispatchEvent,
        undefined
      ),
      new TestMessage(
        "dry1",
        "enter",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.dispatchEvent,
        undefined
      ),
      new TestMessage(
        "wet0",
        "enter",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.dispatchEvent,
        undefined
      ),
      new TestMessage(
        "wet1",
        "enter",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.dispatchEvent,
        undefined
      ),
      new TestMessage(
        "mem0",
        "enter",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.dispatchEvent,
        undefined
      ),
      new TestMessage(
        "mem1",
        "enter",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.dispatchEvent,
        undefined
      ),

      /* entering added event listener */
      new TestMessage("wet0", "enter", "apply", "wet", "dry", TestListeners.target, undefined),
      new TestMessage("wet1", "enter", "apply", "wet", "dry", TestListeners.target, undefined),
      new TestMessage("dry0", "enter", "apply", "wet", "dry", TestListeners.target, undefined),
      new TestMessage("dry1", "enter", "apply", "wet", "dry", TestListeners.target, undefined),
      new TestMessage("mem0", "enter", "apply", "wet", "dry", TestListeners.target, undefined),
      new TestMessage("mem1", "enter", "apply", "wet", "dry", TestListeners.target, undefined),

      /* exiting added event listener */
      new TestMessage("wet0", "return", "apply", "wet", "dry", TestListeners.target, 12),
      new TestMessage("wet1", "return", "apply", "wet", "dry", TestListeners.target, 12),
      new TestMessage("dry0", "return", "apply", "wet", "dry", TestListeners.target, 12),
      new TestMessage("dry1", "return", "apply", "wet", "dry", TestListeners.target, 12),
      new TestMessage("mem0", "return", "apply", "wet", "dry", TestListeners.target, 12),
      new TestMessage("mem1", "return", "apply", "wet", "dry", TestListeners.target, 12),

      /* exiting dispatchEvent */
      new TestMessage(
        "dry0",
        "return",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.dispatchEvent,
        undefined
      ),
      new TestMessage(
        "dry1",
        "return",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.dispatchEvent,
        undefined
      ),
      new TestMessage(
        "wet0",
        "return",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.dispatchEvent,
        undefined
      ),
      new TestMessage(
        "wet1",
        "return",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.dispatchEvent,
        undefined
      ),
      new TestMessage(
        "mem0",
        "return",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.dispatchEvent,
        undefined
      ),
      new TestMessage(
        "mem1",
        "return",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.dispatchEvent,
        undefined
      )
    ];
    testMessageSequence(messages);
  });

  it("on a construct() call", function () {
    parts.handlers.wet.addFunctionListener(TestListeners.wet0);

    const dryElem = new parts.dry.Element(parts.dry.doc, "test");

    const messages = [
      new TestMessage("wet0", "enter", "construct", "dry", "wet", parts.wet.Element, undefined),

      new TestMessage("wet0", "return", "construct", "dry", "wet", parts.wet.Element, dryElem)
    ];
    testMessageSequence(messages);
  });

  it("is ignored for object graphs not involved", function () {
    parts.handlers.wet.addFunctionListener(TestListeners.wet0);
    parts.handlers.dry.addFunctionListener(TestListeners.dry0);

    // ignored in the test
    parts.handlers[DAMP].addFunctionListener(TestListeners.damp);

    const dryElem = parts.dry.doc.createElement("test");

    const messages = [
      new TestMessage(
        "dry0",
        "enter",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.createElement,
        undefined
      ),
      new TestMessage(
        "wet0",
        "enter",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.createElement,
        undefined
      ),

      new TestMessage(
        "dry0",
        "return",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.createElement,
        dryElem
      ),
      new TestMessage("wet0", "return", "apply", "dry", "wet", parts.wet.doc.createElement, dryElem)
    ];
    testMessageSequence(messages);
  });

  it("can be removed at will", function () {
    parts.handlers.wet.addFunctionListener(TestListeners.wet0);

    parts.handlers.dry.addFunctionListener(TestListeners.dry1);
    parts.handlers.dry.addFunctionListener(TestListeners.dry0);

    // ignored in the test
    parts.dry.doc.createElement("test");

    appender.clear();
    parts.handlers.dry.removeFunctionListener(TestListeners.dry1);

    const dryElem = parts.dry.doc.createElement("test");

    const messages = [
      new TestMessage(
        "dry0",
        "enter",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.createElement,
        undefined
      ),
      new TestMessage(
        "wet0",
        "enter",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.createElement,
        undefined
      ),

      new TestMessage(
        "dry0",
        "return",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.createElement,
        dryElem
      ),
      new TestMessage("wet0", "return", "apply", "dry", "wet", parts.wet.doc.createElement, dryElem)
    ];
    testMessageSequence(messages);
  });

  it("can throw an exception and not interfere with other listeners or the target function", function () {
    const staticException = new Error("Unhandled!");

    parts.handlers.wet.addFunctionListener(TestListeners.wet0);

    parts.handlers.dry.addFunctionListener(function (reason: unknown) {
      if (reason !== "enter") {
        return;
      }
      throw staticException;
    });

    parts.handlers.dry.addFunctionListener(TestListeners.dry0);

    mAppender.clear();
    const dryElem = parts.dry.doc.createElement("test");

    const messages = [
      new TestMessage(
        "dry0",
        "enter",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.createElement,
        undefined
      ),
      new TestMessage(
        "wet0",
        "enter",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.createElement,
        undefined
      ),

      new TestMessage(
        "dry0",
        "return",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.createElement,
        dryElem
      ),
      new TestMessage("wet0", "return", "apply", "dry", "wet", parts.wet.doc.createElement, dryElem)
    ];
    testMessageSequence(messages);

    expect(mAppender.events.length).toBe(1);
    if (mAppender.events.length >= 1) {
      expect(mAppender.events[0]!.level).toBe("ERROR");
      expect(mAppender.events[0]!.message).toBe(staticException.message);
    }
  });

  it("notifies of exceptions thrown from the target function", function () {
    parts.handlers.wet.addFunctionListener(TestListeners.wet0);

    const staticException = new Error("Unhandled!");
    parts.wet.doc.generateExceptionString = function () {
      throw staticException;
    };

    parts.handlers.dry.addFunctionListener(TestListeners.dry0);

    var exception;
    try {
      parts.dry.doc.generateExceptionString();
    } catch (ex) {
      exception = ex;
    }
    expect(exception).toBe(staticException);

    const messages = [
      new TestMessage(
        "dry0",
        "enter",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.generateExceptionString,
        undefined
      ),
      new TestMessage(
        "wet0",
        "enter",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.generateExceptionString,
        undefined
      ),

      new TestMessage(
        "dry0",
        "throw",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.generateExceptionString,
        staticException
      ),
      new TestMessage(
        "wet0",
        "throw",
        "apply",
        "dry",
        "wet",
        parts.wet.doc.generateExceptionString,
        staticException
      )
    ];
    testMessageSequence(messages);
  });
});
