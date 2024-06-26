import { screen } from "@testing-library/react";
import type { ButtonHTMLAttributes } from "react";

import { renderComponent } from "testing/utils";

import SideNavigation from "./SideNavigation";

const Link = ({ ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...props} />
);

it("displays links", () => {
  renderComponent(
    <SideNavigation
      items={[
        {
          label: "Link one",
          href: "#",
        },
        {
          label: "Link two",
          href: "#",
        },
      ]}
    />,
  );
  expect(screen.getByRole("link", { name: "Link one" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Link two" })).toBeInTheDocument();
});

it("displays links using a custom component", () => {
  renderComponent(
    <SideNavigation
      items={[
        {
          label: "Link one",
        },
        <Link key="link">Link two</Link>,
      ]}
      linkComponent={Link}
    />,
  );
  expect(screen.getByRole("button", { name: "Link one" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Link two" })).toBeInTheDocument();
});

it("displays a mix of links and custom components", () => {
  renderComponent(
    <SideNavigation
      items={[
        {
          label: "Link one",
          href: "#",
        },
        <Link key="link">Link two</Link>,
      ]}
    />,
  );
  expect(screen.getByRole("link", { name: "Link one" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Link two" })).toBeInTheDocument();
});

it("sets components per link", () => {
  renderComponent(
    <SideNavigation
      items={[
        {
          label: "Link one",
          component: Link,
        },
        {
          label: "Link two",
          component: "h1",
        },
      ]}
    />,
  );
  expect(screen.getByRole("button", { name: "Link one" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Link two" })).toBeInTheDocument();
});

it("sets icons", () => {
  renderComponent(
    <SideNavigation
      hasIcons
      items={[
        {
          label: "Link one",
        },
      ]}
    />,
  );
  expect(
    document.querySelector(".p-side-navigation--icons"),
  ).toBeInTheDocument();
});

it("automatically determines if icon class should be applied", () => {
  renderComponent(
    <SideNavigation
      items={[
        {
          label: "Link one",
          href: "#",
          icon: "user",
        },
      ]}
    />,
  );
  expect(
    document.querySelector(".p-side-navigation--icons"),
  ).toBeInTheDocument();
});
