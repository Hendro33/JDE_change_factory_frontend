import { EmptyState } from "../components/design";
import { Link } from "../router";

export function NotFoundPage() {
  return (
    <EmptyState title="This page does not exist" action={<Link className="btn primary" to="/work">Go to My Work</Link>}>
      The link may be out of date. Everything in Jade starts from My Work or Stories.
    </EmptyState>
  );
}
