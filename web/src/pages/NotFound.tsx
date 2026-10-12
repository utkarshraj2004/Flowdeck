import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export function NotFoundPage({ message }: { message?: string }) {
  return (
    <EmptyState title="Not found">
      <p>{message ?? 'This page doesn’t exist, or you don’t have access to it.'}</p>
      <Link className="btn btn-primary" to="/">
        Go to your boards
      </Link>
    </EmptyState>
  );
}
