import { PageHeader } from './Sheet';

/** One app screen: sticky header plus the centered content column. */
export function Screen({ title, back, actions, children, className = '', style }: {
  title?: string; back?: boolean | string; actions?: React.ReactNode; children: React.ReactNode; className?: string; style?: React.CSSProperties;
}) {
  return (
    <>
      <PageHeader title={title} back={back} actions={actions} />
      <div className={`screen ${className}`} style={style}>{children}</div>
    </>
  );
}
