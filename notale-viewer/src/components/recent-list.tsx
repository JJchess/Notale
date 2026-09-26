"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { recentSessions, relativeTime, type RecentSession } from "../lib/recent-sessions";

/** Sessions this browser opened. Nothing is shown when there are none. */
export function RecentList() {
  const [list, setList] = useState<RecentSession[]>([]);
  useEffect(() => { setList(recentSessions()); }, []);
  if (!list.length) return null;
  return (
    <section className="recent" aria-labelledby="recent-heading">
      <h2 id="recent-heading">最近的会话</h2>
      <ul>{list.map(entry => <li key={entry.id}><Link href={`/s/${entry.id}`}><span className="recent-title">{entry.title}</span><time dateTime={entry.at}>{relativeTime(entry.at)}</time></Link></li>)}</ul>
    </section>
  );
}
