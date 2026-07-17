import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders title, description, and destructive confirm button", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Delete post?"
        description="This can't be undone."
        confirmLabel="Delete post"
        destructive
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText("Delete post?")).toBeInTheDocument();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
    const confirm = screen.getByTestId("confirm-dialog-confirm");
    expect(confirm).toHaveTextContent("Delete post");
    expect(confirm.className).toMatch(/destructive/);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("Cancel does not fire onConfirm", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open onOpenChange={() => {}} title="t" description="d" confirmLabel="ok" onConfirm={onConfirm} />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Confirm fires exactly once even on double-click while loading", async () => {
    let calls = 0;
    let resolveFn: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((res) => {
          calls++;
          resolveFn = res;
        }),
    );
    function Wrapper() {
      const [loading, setLoading] = useState(false);
      return (
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="t"
          description="d"
          confirmLabel="ok"
          loading={loading}
          onConfirm={async () => {
            setLoading(true);
            await onConfirm();
            setLoading(false);
          }}
        />
      );
    }
    render(<Wrapper />);
    const btn = screen.getByTestId("confirm-dialog-confirm");
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(calls).toBe(1);
    await act(async () => { resolveFn(); });
  });
});
