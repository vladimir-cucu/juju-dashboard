import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";

import { DATETIME_LOCAL } from "consts";
import { renderComponent } from "testing/utils";

import AuditLogsFilterPanel from "./AuditLogsFilterPanel";
import { FieldsLabel } from "./Fields";
import { Label } from "./types";

describe("AuditLogsFilterPanel", () => {
  it("restores the filter values from the URL", async () => {
    const params = {
      after: format(new Date(), DATETIME_LOCAL),
      before: format(new Date(), DATETIME_LOCAL),
      user: "user-eggman",
      model: "model1",
      method: "Login",
      panel: "audit-log-filters",
    };
    const queryParams = new URLSearchParams(params);
    renderComponent(<AuditLogsFilterPanel />, {
      url: `/?${queryParams.toString()}`,
    });
    // Have to use querySelector here as RTL doesn't support datetime-local.
    expect(document.querySelector(`input#${FieldsLabel.AFTER}`)).toHaveValue(
      params.after,
    );
    // Have to use querySelector here as RTL doesn't support datetime-local.
    expect(document.querySelector(`input#${FieldsLabel.AFTER}`)).toHaveValue(
      params.before,
    );
    expect(
      screen.getByRole("combobox", { name: FieldsLabel.USER }),
    ).toHaveValue(params.user);
    expect(
      screen.getByRole("combobox", { name: FieldsLabel.METHOD }),
    ).toHaveValue(params.method);
    expect(
      screen.getByRole("combobox", { name: FieldsLabel.METHOD }),
    ).toHaveValue(params.method);
  });

  it("can clear the filters", async () => {
    const params = {
      after: new Date().toISOString(),
      before: new Date().toISOString(),
      user: "user-eggman",
      model: "model1",
      method: "Login",
      panel: "audit-log-filters",
    };
    const queryParams = new URLSearchParams(params);
    const { router } = renderComponent(<AuditLogsFilterPanel />, {
      url: `/?${queryParams.toString()}&page=4`,
    });
    await userEvent.click(screen.getByRole("button", { name: Label.CLEAR }));
    expect(router.state.location.search).toBe("");
  });

  it("disables the clear button if there are no filters", async () => {
    renderComponent(<AuditLogsFilterPanel />, {
      url: "/",
    });
    expect(screen.getByRole("button", { name: Label.CLEAR })).toHaveAttribute(
      "aria-disabled",
    );
  });

  it("can update the filters", async () => {
    const params = {
      after: format(new Date(), "yyyy-MM-dd'T'hh:mm"),
      before: format(new Date(), "yyyy-MM-dd'T'hh:mm"),
      user: "user-eggman",
      model: "model1",
      method: "Login",
    };
    const { router } = renderComponent(<AuditLogsFilterPanel />, {
      url: "/?panel=audit-log-filters&page=4",
    });
    const after = document.querySelector<HTMLInputElement>(
      `input#${FieldsLabel.AFTER}`,
    );
    expect(after).toBeTruthy();
    if (after) {
      await userEvent.type(after, params.after);
    }
    const before = document.querySelector<HTMLInputElement>(
      `input#${FieldsLabel.BEFORE}`,
    );
    expect(before).toBeTruthy();
    if (before) {
      await userEvent.type(before, params.before);
    }
    await userEvent.type(
      screen.getByRole("combobox", { name: FieldsLabel.USER }),
      params.user,
    );
    await userEvent.type(
      screen.getByRole("combobox", { name: FieldsLabel.MODEL }),
      params.model,
    );
    await userEvent.type(
      screen.getByRole("combobox", { name: FieldsLabel.METHOD }),
      params.method,
    );
    await userEvent.click(screen.getByRole("button", { name: Label.FILTER }));
    const queryParams = new URLSearchParams(params);
    expect(router.state.location.search).toBe(`?${queryParams.toString()}`);
  });

  it("removes blank query params", async () => {
    const { router } = renderComponent(<AuditLogsFilterPanel />, {
      url: "/?panel=audit-log-filters",
    });
    await userEvent.type(
      screen.getByRole("combobox", { name: FieldsLabel.METHOD }),
      "Login",
    );
    await userEvent.click(screen.getByRole("button", { name: Label.FILTER }));
    // Only the facade was set, so no other filters should appear in the query string.
    expect(router.state.location.search).toBe("?method=Login");
  });

  it("removes query params if the value was removed", async () => {
    const { router } = renderComponent(<AuditLogsFilterPanel />, {
      url: "/?panel=audit-log-filters&user-tag=user-eggman@external&method=Login",
    });
    await userEvent.clear(
      screen.getByRole("combobox", { name: FieldsLabel.METHOD }),
    );
    await userEvent.click(screen.getByRole("button", { name: Label.FILTER }));
    // The method value was cleared in the input so it should get removed from
    // the query string.
    expect(router.state.location.search).toBe(
      "?user-tag=user-eggman%40external",
    );
  });
});
