"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "careflow-sidebar-expanded-groups";

type SidebarStateContextValue = {
  expandedGroups: ReadonlySet<string>;
  toggleGroup: (label: string) => void;
  isGroupExpanded: (label: string) => boolean;
};

const SidebarStateContext = createContext<SidebarStateContextValue | null>(null);

function readStoredGroups(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function writeStoredGroups(groups: Set<string>) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...groups]));
}

export function SidebarStateProvider({ children }: { children: React.ReactNode }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setExpandedGroups(readStoredGroups());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeStoredGroups(expandedGroups);
  }, [expandedGroups, hydrated]);

  const toggleGroup = useCallback((label: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  const isGroupExpanded = useCallback(
    (label: string) => expandedGroups.has(label),
    [expandedGroups],
  );

  const value = useMemo(
    () => ({
      expandedGroups,
      toggleGroup,
      isGroupExpanded,
    }),
    [expandedGroups, toggleGroup, isGroupExpanded],
  );

  return (
    <SidebarStateContext.Provider value={value}>{children}</SidebarStateContext.Provider>
  );
}

const fallbackSidebarState: SidebarStateContextValue = {
  expandedGroups: new Set(),
  toggleGroup: () => {},
  isGroupExpanded: () => false,
};

export function useSidebarState() {
  const context = useContext(SidebarStateContext);
  return context ?? fallbackSidebarState;
}
