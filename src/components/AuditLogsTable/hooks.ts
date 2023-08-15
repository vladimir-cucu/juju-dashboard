import { useCallback } from "react";
import { useSelector } from "react-redux";
import { useParams } from "react-router-dom";

import type { EntityDetailsRoute } from "components/Routes/Routes";
import { useQueryParams } from "hooks/useQueryParams";
import {
  getControllerConnection,
  getWSControllerURL,
} from "store/general/selectors";
import { actions as jujuActions } from "store/juju";
import { getFullModelName, getModelUUIDFromList } from "store/juju/selectors";
import { useAppDispatch, useAppSelector } from "store/store";

import type { AuditLogFilters } from "./AuditLogsTableFilters/AuditLogsTableFilters";
import { DEFAULT_AUDIT_LOG_FILTERS } from "./AuditLogsTableFilters/AuditLogsTableFilters";
import { DEFAULT_LIMIT_VALUE, DEFAULT_PAGE } from "./consts";

export const useFetchAuditEvents = () => {
  const dispatch = useAppDispatch();
  const wsControllerURL = useSelector(getWSControllerURL);
  const hasControllerConnection = useAppSelector((state) =>
    getControllerConnection(state, wsControllerURL)
  );
  const { modelName, userName } = useParams<EntityDetailsRoute>();
  const modelUUID = useSelector(getModelUUIDFromList(modelName, userName));
  const fullModelName = useAppSelector((state) =>
    getFullModelName(state, modelUUID)
  );
  const [queryParams] = useQueryParams<
    {
      page: string;
      limit: string;
    } & AuditLogFilters
  >({
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT_VALUE.toString(),
    ...DEFAULT_AUDIT_LOG_FILTERS,
  });
  const limit = Number(queryParams.limit);
  const page = Number(queryParams.page);
  const model = fullModelName ?? queryParams.model;
  return useCallback(() => {
    if (!wsControllerURL || !hasControllerConnection) {
      return;
    }
    dispatch(
      jujuActions.fetchAuditEvents({
        wsControllerURL,
        // Fetch an extra entry in order to check if there are more pages.
        limit: limit + 1,
        offset: (page - 1) * limit,
        // Pass undefined to the API if the filters haven't been set.
        after: queryParams.after
          ? new Date(queryParams.after).toISOString()
          : undefined,
        before: queryParams.before
          ? new Date(queryParams.before).toISOString()
          : undefined,
        // Convert the username to a user tag:
        "user-tag": queryParams.user ? `user-${queryParams.user}` : undefined,
        model: model ?? undefined,
        method: queryParams.method ?? undefined,
      })
    );
  }, [
    dispatch,
    hasControllerConnection,
    limit,
    model,
    page,
    wsControllerURL,
    // Pass individual params so that this hook will only run if a specific
    // param changes as opposed to the queryParams object which will change
    // reference on each rerender.
    queryParams.after,
    queryParams.before,
    queryParams.user,
    queryParams.method,
  ]);
};