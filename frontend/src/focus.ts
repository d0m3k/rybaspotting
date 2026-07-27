// One-shot "pending fish focus" used by the Wall to ask the Map page to fly
// to a specific fish and open its detail sheet after navigation.
let pendingFishId: number | null = null;

export function setFocusFish(id: number | null): void {
  pendingFishId = id;
}

export function takeFocusFish(): number | null {
  const v = pendingFishId;
  pendingFishId = null;
  return v;
}