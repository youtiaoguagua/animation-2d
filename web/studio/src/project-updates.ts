/** Decide when a live library update needs a scene reload. */
export function reconcileProjects<T extends { id: string }>(previous: T[], projects: T[], currentId: string | null,
  requestedId: string | null, manualSelection: boolean) {
  const requested = !manualSelection && requestedId;
  const activeId = requested ? projects.find((item) => item.id === requested)?.id || null
    : projects.find((item) => item.id === currentId)?.id || projects[0]?.id || null;
  const before = previous.find((item) => item.id === activeId);
  const after = projects.find((item) => item.id === activeId);
  return {
    activeId,
    waitingFor: requested && !activeId ? requested : null,
    projectsChanged: JSON.stringify(previous) !== JSON.stringify(projects),
    reload: !!activeId && (activeId !== currentId || JSON.stringify(before) !== JSON.stringify(after))
  };
}
