"use client";

import { useEffect, useRef, useState } from "react";
import { PwaUpdatePrompt } from "../PwaUpdatePrompt/PwaUpdatePrompt";

const SERVICE_WORKER_URL = "/sw.js?v=6";
const SKIP_WAITING_MESSAGE = "SKIP_WAITING";
const DEVELOPMENT_RELOAD_KEY = "wca-rankings-development-sw-reset";

export function PwaRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const reloadOnControllerChange = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (!import.meta.env.PROD) {
      void Promise.all([
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.all(
              registrations.map((registration) => registration.unregister()),
            ),
          ),
        "caches" in window
          ? caches
              .keys()
              .then((keys) =>
                Promise.all(
                  keys
                    .filter((key) => key.startsWith("wca-rankings-"))
                    .map((key) => caches.delete(key)),
                ),
              )
          : Promise.resolve([]),
      ]).then(() => {
        if (
          navigator.serviceWorker.controller &&
          sessionStorage.getItem(DEVELOPMENT_RELOAD_KEY) !== "1"
        ) {
          sessionStorage.setItem(DEVELOPMENT_RELOAD_KEY, "1");
          window.location.reload();
          return;
        }
        sessionStorage.removeItem(DEVELOPMENT_RELOAD_KEY);
      });
      return;
    }

    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;
    const watchedWorkers = new Map<ServiceWorker, () => void>();

    const offerUpdate = (worker: ServiceWorker | null) => {
      if (!worker || !navigator.serviceWorker.controller || disposed) return;
      setWaitingWorker(worker);
      setDismissed(false);
    };

    const watchInstallingWorker = (worker: ServiceWorker | null) => {
      if (!worker || watchedWorkers.has(worker)) return;
      const onStateChange = () => {
        if (worker.state === "installed") {
          offerUpdate(registration?.waiting ?? worker);
        }
      };
      watchedWorkers.set(worker, onStateChange);
      worker.addEventListener("statechange", onStateChange);
      onStateChange();
    };

    const onUpdateFound = () => {
      watchInstallingWorker(registration?.installing ?? null);
    };

    const onControllerChange = () => {
      if (!reloadOnControllerChange.current) return;
      reloadOnControllerChange.current = false;
      window.location.reload();
    };

    const checkForUpdate = () => {
      if (document.visibilityState !== "visible") return;
      void registration?.update().catch(() => undefined);
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    document.addEventListener("visibilitychange", checkForUpdate);

    void navigator.serviceWorker
      .register(SERVICE_WORKER_URL, {
        scope: "/",
        updateViaCache: "none",
      })
      .then((nextRegistration) => {
        if (disposed) return;
        registration = nextRegistration;
        registration.addEventListener("updatefound", onUpdateFound);
        offerUpdate(registration.waiting);
        watchInstallingWorker(registration.installing);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", onUpdateFound);
      watchedWorkers.forEach((listener, worker) => {
        worker.removeEventListener("statechange", listener);
      });
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);

  const refresh = () => {
    if (!waitingWorker) return;
    setUpdating(true);
    reloadOnControllerChange.current = true;
    waitingWorker.postMessage({ type: SKIP_WAITING_MESSAGE });
  };

  if (!waitingWorker || dismissed) return null;

  return (
    <PwaUpdatePrompt
      updating={updating}
      onRefresh={refresh}
      onDismiss={() => setDismissed(true)}
    />
  );
}
