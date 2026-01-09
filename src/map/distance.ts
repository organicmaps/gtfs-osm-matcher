
export function getDistanceLatLon([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]): number {
  const R = 6371e3;

  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}


export function getDistanceLonLat([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  return getDistanceLatLon([lat1, lon1], [lat2, lon2]);
}