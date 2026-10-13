/**
 * Plasserer aktiviteter som overlapper i en tidskolonne side om side («baner»).
 * Aktiviteter som henger sammen via overlapp danner en klynge og deler bredden likt.
 * Med `maxLanes` vises høyst så mange side om side; resten markeres `hidden` og samles i en «+N»-knapp.
 */
export interface Placed<T> {
  item: T;
  lane: number;
  lanes: number;
  /** Får ikke plass (bane ≥ maxLanes). */
  hidden: boolean;
  /** Klyngen aktiviteten hører til (samme tall for alle som overlapper hverandre). */
  cluster: number;
}

export function layoutLanes<T>(
  items: T[],
  getStart: (t: T) => number,
  getEnd: (t: T) => number,
  maxLanes = Infinity
): Placed<T>[] {
  const sorted = [...items].sort((a, b) => getStart(a) - getStart(b) || getEnd(b) - getEnd(a));
  const result: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  let clusterNo = 0;

  const flush = () => {
    const lanes = Math.min(laneEnds.length, maxLanes);
    for (const p of cluster) {
      p.lanes = lanes;
      p.hidden = p.lane >= maxLanes;
    }
    result.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterNo++;
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
    cluster.push({ item, lane, lanes: 0, hidden: false, cluster: clusterNo });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return result;
}
