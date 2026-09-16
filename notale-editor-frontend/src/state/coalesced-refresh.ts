/** One active read and one shared follow-up per key, without delaying earlier callers. */
export function coalescedRefresh(read: (key: string) => Promise<void>) {
  const flights = new Map<string, { started: boolean; task: Promise<void> }>();
  return (key: string): Promise<void> => {
    const current = flights.get(key);
    if (current && !current.started) return current.task;
    const flight = { started: false, task: Promise.resolve() };
    flight.task = (current ? current.task.catch(() => {}) : Promise.resolve())
      .then(async () => {
        flight.started = true;
        await read(key);
      }).finally(() => {
        if (flights.get(key) === flight) flights.delete(key);
      });
    flights.set(key, flight);
    return flight.task;
  };
}
