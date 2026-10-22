import { api } from "../../services/api";
import { EmptyState, ErrorState, Loading, Tag, useAsync } from "../../components/design";
import { Link, storyPath } from "../../router";

/**
 * The Administrator's setup list: every gap in this customer's setup that
 * JADE found on its stories, listed once, with every story it affects. A
 * blocker stays visible on each affected story as well; fixing it here lets
 * all of them continue.
 */
export function SetupList() {
  const { data, error } = useAsync(() => api.getSetupList(), []);
  if (error) return <ErrorState error={error} title="The setup list could not be loaded" />;
  if (!data) return <Loading what="the setup list" />;
  if (data.length === 0) return <EmptyState title="Nothing to set up">No open story is waiting on this customer's setup.</EmptyState>;
  return (
    <section className="panel">
      <p className="hint" style={{ marginTop: 0 }}>Fix each item where its action says. Stories it blocks continue once it is fixed;
        JADE checks again when the next step is taken.</p>
      {data.map((t) => (
        <div key={t.id} className="setuptask">
          <div className="btnrow">
            <span className="setuptask-title">{t.title}</span>
            {t.blocks && <Tag tone="stop">Blocks work</Tag>}
          </div>
          {t.action && <div>{t.action}</div>}
          {t.detail && <div className="hint">{t.detail}</div>}
          <ul>{t.stories.map((s) => (
            <li key={s.id}><Link to={storyPath(s.id)}>{s.title}</Link> <span className="mono muted">{s.id}</span>{s.blocks && " — blocked"}</li>
          ))}</ul>
        </div>
      ))}
    </section>
  );
}
