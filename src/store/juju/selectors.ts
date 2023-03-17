import { AdditionalProperties } from "@canonical/jujulib/dist/api/facades/client/ClientV6";
import cloneDeep from "clone-deep";
import { createSelector } from "reselect";

import type {
  AnnotationData,
  ApplicationData,
  MachineData,
  ModelInfo,
  RelationData,
  UnitData,
} from "juju/types";
import { RootState } from "store/store";

import type { Controllers, ModelData, ModelsList } from "./types";
import {
  extractCloudName,
  extractCredentialName,
  extractOwnerName,
  Filters,
  getApplicationStatusGroup,
  getMachineStatusGroup,
  getUnitStatusGroup,
  groupModelsByStatus,
} from "./utils/models";

const slice = (state: RootState) => state.juju;

/**
  Fetches the model data from state.
  @param state The application state.
  @returns The list of model data or null if none found.
*/
export const getModelData = createSelector(
  [slice],
  (sliceState) => sliceState.modelData ?? null
);

/**
  Fetches the controller data from state.
  @param state The application state.
  @returns The list of controller data or null if none found.
*/
export const getControllerData = createSelector(
  [slice],
  (sliceState) => sliceState.controllers
);

const getModelWatcherData = createSelector(
  [slice],
  (sliceState) => sliceState.modelWatcherData
);

const getModelList = createSelector([slice], (sliceState) => sliceState.models);

/**
  Get the loaded state of the model list.
  @returns Whether the model list has been loaded.
*/
export const getModelListLoaded = createSelector(
  [slice],
  (sliceState) => sliceState.modelsLoaded
);

/**
  Whether there are any models in the model list.
  @returns Whether the model list has been loaded.
*/
export const hasModels = createSelector(
  [getModelList],
  (modelList) => Object.keys(modelList).length > 0
);

export function getModelWatcherDataByUUID(modelUUID: string) {
  return createSelector(getModelWatcherData, (modelWatcherData) => {
    if (modelWatcherData?.[modelUUID]) {
      return modelWatcherData[modelUUID];
    }
    return null;
  });
}

export function getModelInfo(modelUUID: string) {
  return createSelector(
    getModelWatcherDataByUUID(modelUUID),
    (modelWatcherData): ModelInfo | null => {
      if (modelWatcherData) {
        return modelWatcherData.model;
      }
      return null;
    }
  );
}

export function getModelUUIDFromList(
  modelName?: string | null,
  ownerName?: string | null
) {
  return createSelector(getModelList, (modelList: ModelsList) => {
    let modelUUID = "";
    if (!modelList || !modelName || !ownerName) {
      return modelUUID;
    }
    Object.entries(modelList).some(([_key, { name, ownerTag, uuid }]) => {
      if (name === modelName && ownerTag.replace("user-", "") === ownerName) {
        modelUUID = uuid;
        return true;
      }
      return false;
    });
    return modelUUID;
  });
}

export function getModelAnnotations(modelUUID: string) {
  return createSelector(
    getModelWatcherDataByUUID(modelUUID),
    (modelWatcherData): AnnotationData | null => {
      if (modelWatcherData) {
        return modelWatcherData.annotations;
      }
      return null;
    }
  );
}

export function getModelApplications(modelUUID: string) {
  return createSelector(
    getModelWatcherDataByUUID(modelUUID),
    (modelWatcherData): ApplicationData | null => {
      if (modelWatcherData) {
        return modelWatcherData.applications;
      }
      return null;
    }
  );
}

export function getModelUnits(modelUUID: string) {
  return createSelector(
    getModelWatcherDataByUUID(modelUUID),
    (modelWatcherData): UnitData | null => {
      if (modelWatcherData) {
        return modelWatcherData.units;
      }
      return null;
    }
  );
}

export function getModelRelations(modelUUID: string) {
  return createSelector(
    getModelWatcherDataByUUID(modelUUID),
    (modelWatcherData): RelationData | null => {
      if (modelWatcherData) {
        return modelWatcherData.relations;
      }
      return null;
    }
  );
}

export function getModelMachines(modelUUID: string) {
  return createSelector(
    getModelWatcherDataByUUID(modelUUID),
    (modelWatcherData): MachineData | null => {
      if (modelWatcherData) {
        return modelWatcherData.machines;
      }
      return null;
    }
  );
}

// The order of this enum is important. It needs to be organized in order of
// best to worst status.
export enum Statuses {
  running,
  alert,
  blocked,
}

export interface StatusData {
  // keyof typeof returns the list of string keys in the Statuses enum
  // not the numeric indexes generated at compile time.
  [applicationName: string]: keyof typeof Statuses;
}

/**
  Returns an object of key value pairs indicating an
  applications aggregate unit status.
*/
export function getAllModelApplicationStatus(modelUUID: string) {
  return createSelector(
    getModelUnits(modelUUID),
    (units): StatusData | null => {
      if (!units) {
        return null;
      }

      const applicationStatuses: StatusData = {};
      // Convert the various unit statuses into our three current
      // status types "blocked", "alert", "running".
      Object.entries(units).forEach(([_unitId, unitData]) => {
        let workloadStatus = Statuses.running;
        switch (unitData["workload-status"].current) {
          case "maintenance":
          case "waiting":
            workloadStatus = Statuses.alert;
            break;
          case "blocked":
            workloadStatus = Statuses.blocked;
            break;
        }

        let agentStatus = Statuses.running;
        switch (unitData["agent-status"].current) {
          case "allocating":
          case "executing":
          case "rebooting":
            agentStatus = Statuses.alert;
            break;
          case "failed":
          case "lost":
            agentStatus = Statuses.blocked;
            break;
        }
        // Use the enum index to determine the worst status value.
        const worstStatusIndex = Math.max(
          workloadStatus,
          agentStatus,
          Statuses.running
        );

        applicationStatuses[unitData.application] = Statuses[
          worstStatusIndex
        ] as keyof typeof Statuses;
      });

      return applicationStatuses;
    }
  );
}
/**
  Returns a selector for the filtered model data.
  @param filters The filters to filter the model data by.
  @returns A selector for the filtered model data.
*/
export const getFilteredModelData = (filters: Filters) =>
  createSelector(
    [getModelData, getControllerData],
    (modelData, controllers) => {
      const clonedModelData = cloneDeep(modelData);
      // Add the controller name to the model data where we have a valid name.
      Object.entries(clonedModelData ?? {}).forEach((model) => {
        if (model[1].info) {
          let controllerName = null;
          const modelInfo:
            | (ModelData["info"] & {
                controllerName?: string;
              })
            | null = model[1].info ?? null;
          if (!modelInfo) {
            return;
          }
          if (controllers) {
            Object.entries(controllers).some((controller) => {
              const controllerData = controller[1].find(
                (controller) =>
                  "uuid" in controller &&
                  modelInfo["controller-uuid"] === controller.uuid
              );
              controllerName =
                controllerData && "path" in controllerData
                  ? controllerData?.path
                  : null;
              return controllerName;
            });
          }
          if (
            modelInfo["controller-uuid"] ===
            "a030379a-940f-4760-8fcf-3062b41a04e7"
          ) {
            controllerName = "JAAS";
          }
          if (!controllerName) {
            controllerName = modelInfo["controller-uuid"];
          }
          modelInfo.controllerName = controllerName;
        }
      });
      if (!filters) {
        return clonedModelData;
      }
      const filterSegments: Record<string, string[][]> = {};

      // Collect segments from filter data
      Object.entries(filters).forEach((filter) => {
        if (filter[1].length === 0) return;
        if (!filterSegments[filter[0]]) {
          filterSegments[filter[0]] = [];
        }
        filterSegments[filter[0]].push(filter[1]);
      });

      Object.entries(clonedModelData ?? {}).forEach(([uuid, data]) => {
        const modelName = "model" in data ? data?.model?.name : null;
        const cloud =
          "model" in data ? extractCloudName(data.model["cloud-tag"]) : null;
        const credential =
          "info" in data
            ? extractCredentialName(data.info?.["cloud-credential-tag"])
            : null;
        const region = "model" in data ? data.model.region : null;
        const owner = data.info
          ? extractOwnerName(data.info["owner-tag"])
          : null;
        // Combine all of the above to create string for fuzzy custom search
        const combinedModelAttributes = `${modelName} ${cloud} ${credential} ${region} ${owner}`;

        const remove = Object.entries(filterSegments).some(
          ([segment, valuesArr]) => {
            const values: string[] = valuesArr[0];
            switch (segment) {
              case "cloud":
                return !cloud || !values.includes(cloud);
              case "credential":
                if ("info" in data) {
                  return !credential || !values.includes(credential);
                }
                break;
              case "region":
                return !region || !values.includes(region);
              case "owner":
                if ("info" in data) {
                  return !owner || !values.includes(owner);
                }
                break;
              case "custom":
                return !values.some(combinedModelAttributes.includes);
            }
            return false;
          }
        );
        if (remove) {
          delete clonedModelData?.[uuid as keyof ModelData];
        }
      });
      return clonedModelData;
    }
  );

/**
  Gets the model UUID from the supplied name using a memoized selector
  Usage:
    const getModelUUIDMemo = useMemo(getModelUUID.bind(null, modelName), [
      modelName
    ]);

  @param name The name of the model.
  @returns The memoized selector to return a modelUUID.
*/
export const getModelUUID = (name: string) => {
  return createSelector(getModelData, (modelData) => {
    let owner = null;
    let modelName = null;
    if (name?.includes("/")) {
      [owner, modelName] = name.split("/");
    } else {
      modelName = name;
    }
    if (modelData) {
      for (let uuid in modelData) {
        const model = modelData[uuid].info;
        if (model && model.name === modelName) {
          if (owner) {
            if (model["owner-tag"] === `user-${owner}`) {
              // If this is a shared model then we'll also have an owner name
              return uuid;
            }
          } else {
            return uuid;
          }
        }
      }
    }
    return null;
  });
};

/**
    Returns a model status for the supplied modelUUID.
    @param modelUUID The model UUID to fetch the status for
    @returns The memoized selector to return the model status.
  */
export const getModelStatus = (modelUUID?: string | null) => {
  return createSelector(getModelData, (modelData) =>
    modelUUID ? modelData?.[modelUUID] ?? null : null
  );
};

/**
    Returns the model data filtered and grouped by status.
    @param filters The filters to filter the model data by.
    @returns The filtered and grouped model data.
  */
export const getGroupedByStatusAndFilteredModelData = (filters: Filters) =>
  createSelector(getFilteredModelData(filters), groupModelsByStatus);

/**
    Returns the model data filtered and grouped by cloud.
    @param filters The filters to filter the model data by.
    @returns The filtered and grouped model data.
  */
export const getGroupedByCloudAndFilteredModelData = (filters: Filters) =>
  createSelector(getFilteredModelData(filters), (modelData) => {
    const grouped: Record<string, ModelData[]> = {};
    if (!modelData) {
      return grouped;
    }
    for (let modelUUID in modelData) {
      const model = modelData[modelUUID];
      if (model.info) {
        const cloud = extractCloudName(model.info["cloud-tag"]);
        if (!grouped[cloud]) {
          grouped[cloud] = [];
        }
        grouped[cloud].push(model);
      }
    }
    return grouped;
  });

/**
    Returns the model data filtered and grouped by owner.
    @param filters The filters to filter the model data by.
    @returns The filtered and grouped model data.
  */
export const getGroupedByOwnerAndFilteredModelData = (filters: Filters) =>
  createSelector(getFilteredModelData(filters), (modelData) => {
    const grouped: Record<string, ModelData[]> = {};
    if (!modelData) {
      return grouped;
    }
    for (let modelUUID in modelData) {
      const model = modelData[modelUUID];
      if (model.info) {
        const owner = extractOwnerName(model.info["owner-tag"]);
        if (!grouped[owner]) {
          grouped[owner] = [];
        }
        grouped[owner].push(model);
      }
    }
    return grouped;
  });

/**
    Returns the model statuses sorted by status.
    @returns The memoized selector to return the sorted model statuses.
  */
export const getGroupedModelDataByStatus = createSelector(
  getModelData,
  groupModelsByStatus
);

/**
    Returns the machine instances sorted by status.
    @returns The memoized selector to return the sorted machine instances.
  */
export const getGroupedMachinesDataByStatus = createSelector(
  getModelData,
  (modelData) => {
    const grouped: Record<string, AdditionalProperties[]> = {
      blocked: [],
      alert: [],
      running: [],
    };
    if (!modelData) {
      return grouped;
    }
    for (let modelUUID in modelData) {
      const model = modelData[modelUUID];
      for (let machineID in model.machines) {
        const machine = model.machines[machineID];
        grouped[getMachineStatusGroup(machine).status].push(machine);
      }
    }
    return grouped;
  }
);

/**
    Returns the unit instances sorted by status.
    @returns The memoized selector to return the sorted unit instances.
  */
export const getGroupedUnitsDataByStatus = createSelector(
  getModelData,
  (modelData) => {
    const grouped: Record<string, AdditionalProperties[]> = {
      blocked: [],
      alert: [],
      running: [],
    };
    if (!modelData) {
      return grouped;
    }
    for (let modelUUID in modelData) {
      const model = modelData[modelUUID];
      for (let applicationID in model.applications) {
        const application = model.applications[applicationID];
        for (let unitID in application.units) {
          const unit = application.units[unitID];
          grouped[getUnitStatusGroup(unit).status].push(unit);
        }
      }
    }
    return grouped;
  }
);

/**
    Returns the application instances sorted by status.
    @returns The memoized selector to return the sorted application instances.
  */
export const getGroupedApplicationsDataByStatus = createSelector(
  getModelData,
  (modelData) => {
    const grouped: Record<string, AdditionalProperties[]> = {
      blocked: [],
      alert: [],
      running: [],
    };
    if (!modelData) {
      return grouped;
    }
    for (let modelUUID in modelData) {
      const model = modelData[modelUUID];
      for (let applicationID in model.applications) {
        const application = model.applications[applicationID];
        grouped[getApplicationStatusGroup(application).status].push(
          application
        );
      }
    }
    return grouped;
  }
);

/**
    Returns the counts of the model statuses
    @returns The memoized selector to return the model status counts.
  */
export const getGroupedModelStatusCounts = createSelector(
  getGroupedModelDataByStatus,
  (groupedModelStatuses) => {
    const counts = {
      blocked: groupedModelStatuses.blocked.length,
      alert: groupedModelStatuses.alert.length,
      running: groupedModelStatuses.running.length,
    };
    return counts;
  }
);

/**
    Returns the controller data in the format of an Object.entries output.
    [wsControllerURL, [data]]
    @param controllerUUID The full controller UUID.
    @returns The controller data in the format of an Object.entries output.
  */
export const getControllerDataByUUID = (controllerUUID?: string) => {
  return createSelector(getControllerData, (controllerData) => {
    if (!controllerData) return null;
    const found = Object.entries(controllerData).find((controller) => {
      // Loop through the sub controllers for each primary controller.
      // This is typically only seen in JAAS. Outside of JAAS there is only ever
      // a single sub controller.
      return controller[1].find(
        (subController) =>
          "uuid" in subController && controllerUUID === subController.uuid
      );
    });
    return found;
  });
};

/**
    @param controllerUUID The full controller UUID.
    @returns The controllerData.
  */
export const getModelControllerDataByUUID = (controllerUUID?: string) => {
  return createSelector(getControllerData, (controllerData) => {
    if (!controllerData || !controllerUUID) return null;
    let modelController: (Controllers[0][0] & { url?: string }) | null = null;
    for (const controller of Object.entries(controllerData)) {
      modelController = { path: "/", uuid: "abc123", version: "1" };
      // Loop through the sub controllers for each primary controller.
      // This is typically only seen in JAAS. Outside of JAAS there is only ever
      // a single sub controller.
      const modelControllerData = controller[1].find(
        (subController) =>
          "uuid" in subController && controllerUUID === subController.uuid
      );
      if (modelControllerData) {
        modelController = modelControllerData;
        break;
      }
    }
    // This adds the controller url to existing model controller info so it can be used to access the
    // write facades on the api
    const clonedModelController = cloneDeep(modelController);
    if (clonedModelController) {
      clonedModelController.url = Object.keys(controllerData)[0];
    }
    return clonedModelController;
  });
};
/**
 * @returns A list of charms that are used by the selected applications.
 */
export function getCharms() {
  return createSelector([slice], (sliceState) => {
    return sliceState.charms.filter((charm) => {
      return sliceState.selectedApplications.some(
        (application) => application["charm-url"] === charm.url
      );
    });
  });
}

/**
 * @param charmURL The charm URL to filter by.
 * @returns A list of applications that are selected.
 */
export function getSelectedApplications(charmURL?: string) {
  return createSelector([slice], (sliceState) => {
    if (!charmURL) {
      return sliceState.selectedApplications;
    }
    return sliceState.selectedApplications.filter(
      (application) => application["charm-url"] === charmURL
    );
  });
}

/**
 * @param charmURL The charm URL to filter by.
 * @returns The charm object that matches the charm URL.
 */
export function getSelectedCharm(charmURL: string) {
  return createSelector([slice], (sliceState) => {
    return sliceState.charms.find((charm) => charm.url === charmURL);
  });
}