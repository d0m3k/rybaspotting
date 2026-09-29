import { navigate } from '../router';

interface Props {
  /** User id — when missing/invalid, renders plain text (no link). */
  userId?: number | null;
  name: string;
  class?: string;
  style?: any;
  title?: string;
  /** Stop the click from bubbling to a parent card's onClick (default true). */
  stopPropagation?: boolean;
}

/**
 * Renders a username as a link to that user's public profile.
 * Falls back to a plain <span> when no valid user id is known.
 */
export function UserLink({ userId, name, class: cls, style, title, stopPropagation = true }: Props) {
  const id = Number(userId);
  const valid = userId != null && Number.isInteger(id) && id > 0;

  if (!valid) {
    return <span class={cls} style={style}>{name}</span>;
  }

  return (
    <a
      href={`#/user/${id}`}
      class={cls ? `user-link ${cls}` : 'user-link'}
      style={style}
      title={title || `Profil: ${name}`}
      onClick={(e: any) => {
        e.preventDefault();
        if (stopPropagation) e.stopPropagation();
        navigate({ page: 'user', userId: id });
      }}
    >
      {name}
    </a>
  );
}
