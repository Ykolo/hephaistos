/** Champs des formulaires de compte, dans la charte du site (cf. contact). */

export const inputCls =
  "w-full border-0 border-b border-line-strong bg-transparent py-[11px] text-[15px] outline-none focus:border-ink";

export const labelCls = "mb-2 block text-[11px] uppercase tracking-[.14em] text-muted-ink";

export const submitCls =
  "mt-3 cursor-pointer self-start border border-ink bg-ink px-11 py-[17px] text-[11.5px] font-semibold uppercase tracking-[.18em] text-white transition-colors hover:bg-paper hover:text-ink disabled:cursor-default disabled:opacity-60";

export function Field({
  id,
  label,
  hint,
  ...input
}: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        className={inputCls}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...input}
      />
      {hint && (
        <span id={`${id}-hint`} className="mt-1 block text-[11.5px] leading-[1.5] text-muted-ink">
          {hint}
        </span>
      )}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="m-0 text-[12.5px] text-red-700">
      {message}
    </p>
  );
}

/** Encadré de confirmation, à la place du formulaire une fois envoyé. */
export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="bg-sand px-9 py-12 text-center">
      <div className="mb-[14px] font-serif text-[1.8rem]">{title}</div>
      <div className="text-[14px] leading-[1.7] text-body">{children}</div>
    </div>
  );
}

/**
 * `onSubmit` plutôt que `<form action>` : depuis React 19, une action de
 * formulaire **vide les champs** après l'envoi. Après un mot de passe erroné,
 * le client devrait ressaisir son email. Ici, rien n'est effacé.
 */
export function submitWith(handler: (form: FormData) => void | Promise<void>) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handler(new FormData(event.currentTarget));
  };
}
