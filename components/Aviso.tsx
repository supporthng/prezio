export function Aviso({ error, bien }: { error?: string; bien?: string }) {
  if (error) return <p className="aviso error" role="alert">{error}</p>;
  if (bien) return <p className="aviso bien" role="status">{bien}</p>;
  return null;
}
