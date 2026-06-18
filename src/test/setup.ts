import "@testing-library/jest-dom";
import { vi } from "vitest";
import React from "react";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom doesn't implement these — Radix uses them for focus/scroll lock and
// without stubs the portalled Sheet/Dialog can spin in the sandbox harness.
if (!(Element.prototype as any).scrollIntoView) {
  (Element.prototype as any).scrollIntoView = () => {};
}
if (!(window as any).ResizeObserver) {
  (window as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!(window as any).IntersectionObserver) {
  (window as any).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}
(HTMLElement.prototype as any).hasPointerCapture = () => false;
(HTMLElement.prototype as any).releasePointerCapture = () => {};
(HTMLElement.prototype as any).setPointerCapture = () => {};

// Replace Radix Sheet with a transparent passthrough so portal + focus-trap
// machinery doesn't deadlock under jsdom.
vi.mock("@/components/ui/sheet", () => {
  const passthrough = (tag: string) =>
    ({ children, ...props }: any) => React.createElement(tag, props, children);
  return {
    Sheet: passthrough("div"),
    SheetTrigger: passthrough("button"),
    SheetContent: passthrough("div"),
    SheetHeader: passthrough("div"),
    SheetFooter: passthrough("div"),
    SheetTitle: passthrough("h2"),
    SheetDescription: passthrough("p"),
    SheetClose: passthrough("button"),
    SheetPortal: passthrough("div"),
    SheetOverlay: passthrough("div"),
  };
});
