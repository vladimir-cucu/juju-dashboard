import {
  actionsList,
  storeLoginError,
  updateControllerConnection,
  updateJujuAPIInstance,
  updatePingerIntervalId,
} from "app/actions";
import * as jujuModule from "juju";
import { updateModelList } from "juju/actions";
import { AnyAction, MiddlewareAPI } from "redux";

import { modelPollerMiddleware } from "./model-poller";

type Conn = {
  facades: {
    modelManager: {
      listModels: jest.Mock<any, any>;
    };
  };
  info: {
    user: {};
  };
};

jest.mock("juju", () => ({
  disableControllerUUIDMasking: jest
    .fn()
    .mockImplementation(async () => await Promise.resolve()),
  fetchControllerList: jest
    .fn()
    .mockImplementation(async () => await Promise.resolve()),
  loginWithBakery: jest.fn(),
  fetchAllModelStatuses: jest.fn(),
}));

describe("model poller", () => {
  let fakeStore: MiddlewareAPI;
  let next: jest.Mock;
  const originalLog = console.log;
  const wsControllerURL = "wss://example.com";
  const controllers = [[wsControllerURL, {}, {}, false]];
  const models = [{ model: { uuid: "abc123" } }];
  const juju = { is: "juju" };
  const intervalId = 99;
  let conn: Conn;
  const storeState = {
    juju: {
      controllers: {
        [wsControllerURL]: [{ uuid: "abc123" }],
      },
    },
    root: {
      controllerConnections: {
        [wsControllerURL]: {
          info: {
            user: {
              identity: { this: "is" },
            },
          },
        },
      },
    },
  };

  beforeEach(() => {
    jest.useFakeTimers();
    next = jest.fn();
    fakeStore = {
      getState: jest.fn(() => ({})),
      dispatch: jest.fn(),
    };
    conn = {
      facades: {
        modelManager: {
          listModels: jest.fn().mockResolvedValue({ "user-models": models }),
        },
      },
      info: {
        user: {},
      },
    };
  });

  const runMiddleware = async (actionOverrides?: Partial<AnyAction>) => {
    const action = {
      type: actionsList.connectAndPollControllers,
      payload: {
        controllers,
        isJuju: true,
      },
      ...(actionOverrides ?? {}),
    };
    await modelPollerMiddleware(fakeStore)(next)(action);
  };

  afterEach(() => {
    console.log = originalLog;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("ignores unrelated actions", async () => {
    const action = {
      type: "UNKNOWN",
      payload: null,
    };
    await runMiddleware(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(fakeStore.getState).not.toHaveBeenCalled();
    expect(fakeStore.dispatch).not.toHaveBeenCalledWith(action);
  });

  it("does not pass through matched actions", async () => {
    await runMiddleware({ payload: { controllers: [], isJuju: true } });
    expect(next).not.toHaveBeenCalled();
  });

  it("dispatches login errors", async () => {
    jest
      .spyOn(jujuModule, "loginWithBakery")
      .mockImplementation(async () => ({ error: "Uh oh!" }));
    await runMiddleware();
    expect(next).not.toHaveBeenCalled();
    expect(fakeStore.dispatch).toHaveBeenCalledWith(storeLoginError("Uh oh!"));
  });

  it("logs login exceptions", async () => {
    jest.spyOn(console, "log").mockImplementation(jest.fn);
    jest.spyOn(jujuModule, "loginWithBakery").mockImplementation(async () => {
      throw new Error("Uh oh!");
    });
    await runMiddleware();
    expect(next).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      "unable to log into controller",
      new Error("Uh oh!"),
      ["wss://example.com", {}, {}, false]
    );
  });

  it("fetches and stores data", async () => {
    const fetchControllerList = jest.spyOn(jujuModule, "fetchControllerList");
    conn.facades.modelManager.listModels.mockResolvedValue({
      "user-models": [],
    });
    jest.spyOn(jujuModule, "loginWithBakery").mockImplementation(async () => ({
      conn,
      intervalId,
      juju,
    }));
    await runMiddleware();
    expect(next).not.toHaveBeenCalled();
    expect(fakeStore.dispatch).toHaveBeenCalledWith(
      updateControllerConnection(wsControllerURL, conn)
    );
    expect(fakeStore.dispatch).toHaveBeenCalledWith(
      updateJujuAPIInstance(wsControllerURL, juju)
    );
    expect(fakeStore.dispatch).toHaveBeenCalledWith(
      updatePingerIntervalId(wsControllerURL, intervalId)
    );
    expect(fetchControllerList).toHaveBeenCalledWith(
      wsControllerURL,
      conn,
      false,
      fakeStore
    );
  });

  it("does not disable masking when running on Juju", async () => {
    const disableControllerUUIDMasking = jest.spyOn(
      jujuModule,
      "disableControllerUUIDMasking"
    );
    conn.facades.modelManager.listModels.mockResolvedValue({
      "user-models": [],
    });
    jest.spyOn(jujuModule, "loginWithBakery").mockImplementation(async () => ({
      conn,
      intervalId,
      juju,
    }));
    await runMiddleware();
    expect(next).not.toHaveBeenCalled();
    expect(disableControllerUUIDMasking).not.toHaveBeenCalled();
  });

  it("disables masking when using JIMM", async () => {
    const disableControllerUUIDMasking = jest.spyOn(
      jujuModule,
      "disableControllerUUIDMasking"
    );
    conn.facades.modelManager.listModels.mockResolvedValue({
      "user-models": [],
    });
    jest.spyOn(jujuModule, "loginWithBakery").mockImplementation(async () => ({
      conn,
      intervalId,
      juju,
    }));
    await runMiddleware({
      payload: {
        controllers,
        isJuju: false,
      },
    });
    expect(next).not.toHaveBeenCalled();
    expect(disableControllerUUIDMasking).toHaveBeenCalledWith(conn);
  });

  it("fails silently if the user is not authorised to disable masking", async () => {
    jest
      .spyOn(jujuModule, "disableControllerUUIDMasking")
      .mockImplementation(() => Promise.reject());
    conn.facades.modelManager.listModels.mockResolvedValue({
      "user-models": [],
    });
    jest.spyOn(jujuModule, "loginWithBakery").mockImplementation(async () => ({
      conn,
      intervalId,
      juju,
    }));
    await runMiddleware();
    expect(next).not.toHaveBeenCalled();
  });

  it("fetches and updates models if logged in to controller", async () => {
    jest.spyOn(fakeStore, "getState").mockReturnValue(storeState);
    const fetchAllModelStatuses = jest.spyOn(
      jujuModule,
      "fetchAllModelStatuses"
    );
    jest.spyOn(jujuModule, "loginWithBakery").mockImplementation(async () => ({
      conn,
      intervalId,
      juju,
    }));
    await runMiddleware();
    // For some reason the listModels call doesn't resolve before the test
    // finishes so force the test to wait for the next process:
    await new Promise(jest.requireActual("timers").setImmediate);
    expect(next).not.toHaveBeenCalled();
    expect(fakeStore.dispatch).toHaveBeenCalledWith(
      updateModelList({ "user-models": models }, wsControllerURL)
    );
    expect(fetchAllModelStatuses).toHaveBeenCalledWith(
      wsControllerURL,
      ["abc123"],
      conn,
      fakeStore
    );
  });

  it("updates models every 30 seconds", async () => {
    jest.spyOn(fakeStore, "getState").mockReturnValue(storeState);
    const fetchAllModelStatuses = jest.spyOn(
      jujuModule,
      "fetchAllModelStatuses"
    );
    const models = [{ model: { uuid: "abc123" } }];
    jest.spyOn(jujuModule, "loginWithBakery").mockImplementation(async () => ({
      conn,
      intervalId,
      juju,
    }));
    await runMiddleware();
    // For some reason the listModels call doesn't resolve before the test
    // finishes so force the test to wait for the next process:
    await new Promise(jest.requireActual("timers").setImmediate);
    jest.advanceTimersByTime(30000);
    // Resolve the async calls again.
    await new Promise(jest.requireActual("timers").setImmediate);
    expect(next).not.toHaveBeenCalled();
    const updateModels = updateModelList(
      { "user-models": models },
      wsControllerURL
    );
    expect(fakeStore.dispatch).toHaveBeenNthCalledWith(4, updateModels);
    expect(fakeStore.dispatch).toHaveBeenNthCalledWith(5, updateModels);
    expect(fetchAllModelStatuses).toHaveBeenCalledTimes(2);
  });

  it("does not update models if the user logs out", async () => {
    jest.spyOn(fakeStore, "getState").mockReturnValue({
      ...storeState,
      root: {
        controllerConnections: {
          [wsControllerURL]: {
            info: {
              user: {
                identity: null,
              },
            },
          },
        },
      },
    });
    const fetchAllModelStatuses = jest.spyOn(
      jujuModule,
      "fetchAllModelStatuses"
    );
    const models = [{ model: { uuid: "abc123" } }];
    jest.spyOn(jujuModule, "loginWithBakery").mockImplementation(async () => ({
      conn,
      intervalId,
      juju,
    }));
    await runMiddleware();
    // For some reason the listModels call doesn't resolve before the test
    // finishes so force the test to wait for the next process:
    await new Promise(jest.requireActual("timers").setImmediate);
    jest.advanceTimersByTime(30000);
    // Resolve the async calls again.
    await new Promise(jest.requireActual("timers").setImmediate);
    expect(next).not.toHaveBeenCalled();
    const updateModels = updateModelList(
      { "user-models": models },
      wsControllerURL
    );
    expect(fakeStore.dispatch).toHaveBeenNthCalledWith(4, updateModels);
    expect(fakeStore.dispatch).toHaveBeenCalledTimes(4);
    expect(fetchAllModelStatuses).toHaveBeenCalledTimes(1);
  });
});