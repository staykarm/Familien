/**
 * Plasserer aktiviteter som overlapper i en tidskolonne side om side («baner»).
 * Aktiviteter som henger sammen via overlapp danner en klynge og deler bredden likt.
 */
export interface Placed<T> {
  item: T;
  lane: number;
  lanes: number;
}

export function layoutLanes<T>(items: T[], getStart: (t: T) => number, getEnd: (t: T) => number): Placed<T>[] {
  const sorted = [...items].sort((a, b) => getStart(a) - getStart(b) || getEnd(b) - getEnd(a));
  const result: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const p of cluster) p.lanes = laneEnds.length;
    result.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    const start = getStart(item);
    // Minst 15 min høyde, så korte aktiviteter ikke tegnes oppå hverandre.
    const end = Math.max(getEnd(item), start + 15);
    if (start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    cluster.push({ item, lane, lanes: 0 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return result;
}
