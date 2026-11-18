// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FormTimingProvider, useFormTiming, type ExperienceForm } from "@/app/_components/experience-state/form-timing";
import { useHoneypot } from "./honeypot-field";

type ProbeState = ReturnType<typeof useHoneypot> & { resetRitual: () => void };

// Shows what useHoneypot hands back, and gives a test a way to type into it and restart it.
function Probe({ form, onProbe }: { form: ExperienceForm; onProbe: (probe: ProbeState) => void }) {
  const honeypot = useHoneypot(form);
  const { resetRitualTimings } = useFormTiming();
  onProbe({ ...honeypot, resetRitual: resetRitualTimings });
  return <output data-testid={`value-${form}`}>{honeypot.honeypot}</output>;
}

// The provider stays mounted while a Probe is replaced (a new key remounts it), like Leave a
// Trace swapping its writing form for the letters choice, or a locale switch remounting a form.
function mount(forms: ExperienceForm[], generation: number, probes: Record<string, ProbeState>) {
  return (
    <FormTimingProvider>
      {forms.map((form) => (
        <Probe key={`${form}-${generation}`} form={form} onProbe={(probe) => (probes[form] = probe)} />
      ))}
    </FormTimingProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe("useHoneypot", () => {
  it("starts empty", () => {
    const probes: Record<string, ProbeState> = {};
    render(mount(["leave-a-trace"], 0, probes));

    expect(probes["leave-a-trace"].honeypot).toBe("");
  });

  it("keeps what was typed when the component is replaced by another one for the same form", () => {
    const probes: Record<string, ProbeState> = {};
    const view = render(mount(["leave-a-trace"], 0, probes));
    act(() => probes["leave-a-trace"].setHoneypot("http://spam.example"));
    expect(screen.getByTestId("value-leave-a-trace").textContent).toBe("http://spam.example");

    view.rerender(mount(["leave-a-trace"], 1, probes));

    expect(screen.getByTestId("value-leave-a-trace").textContent).toBe("http://spam.example");
    expect(probes["leave-a-trace"].honeypot).toBe("http://spam.example");
  });

  it("keeps the time the form was first shown across the same replacement", () => {
    const probes: Record<string, ProbeState> = {};
    const view = render(mount(["leave-a-trace"], 0, probes));
    const shownAt = probes["leave-a-trace"].formRenderedAt;

    view.rerender(mount(["leave-a-trace"], 1, probes));

    expect(probes["leave-a-trace"].formRenderedAt).toBe(shownAt);
  });

  it("keeps each form's value apart from the others'", () => {
    const probes: Record<string, ProbeState> = {};
    render(mount(["write", "leave-a-trace", "contribute"], 0, probes));

    act(() => probes["leave-a-trace"].setHoneypot("filled"));

    expect(screen.getByTestId("value-write").textContent).toBe("");
    expect(screen.getByTestId("value-contribute").textContent).toBe("");
    expect(screen.getByTestId("value-leave-a-trace").textContent).toBe("filled");
  });

  it("restarting a form clears what was typed, and a replacement then starts clean", () => {
    const probes: Record<string, ProbeState> = {};
    const view = render(mount(["write"], 0, probes));
    act(() => probes.write.setHoneypot("filled"));

    act(() => probes.write.restartHoneypot());
    view.rerender(mount(["write"], 1, probes));

    expect(probes.write.honeypot).toBe("");
  });

  it("returning home starts a new ritual: Write and Leave a Trace forget what was typed, Contribute keeps its own", () => {
    const probes: Record<string, ProbeState> = {};
    const view = render(mount(["write", "leave-a-trace", "contribute"], 0, probes));
    act(() => {
      probes.write.setHoneypot("a");
      probes["leave-a-trace"].setHoneypot("b");
      probes.contribute.setHoneypot("c");
    });

    act(() => probes.write.resetRitual());
    view.rerender(mount(["write", "leave-a-trace", "contribute"], 1, probes));

    expect(probes.write.honeypot).toBe("");
    expect(probes["leave-a-trace"].honeypot).toBe("");
    expect(probes.contribute.honeypot).toBe("c");
  });
});
