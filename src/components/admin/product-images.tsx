"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  removeProductImage,
  reorderProductImages,
  uploadProductImage,
} from "@/server/actions/admin-images";

export type AdminImage = {
  id: string;
  blobUrl: string;
  alt: string;
  role: "PRIMARY" | "HOVER" | "GALLERY";
  position: number;
};

const label = "mb-1.5 block text-[11px] uppercase tracking-[.12em] text-muted-ink";
const field =
  "w-full border border-line-strong bg-transparent px-3 py-2 text-[14px] outline-none focus:border-ink";

const ROLE_LABEL = {
  PRIMARY: "Couverture",
  HOVER: "Survol",
  GALLERY: "Galerie",
} as const;

export function ProductImages({
  productSlug,
  images,
  driver,
}: {
  productSlug: string;
  images: AdminImage[];
  /** Affiché pour lever toute ambiguïté sur la destination des fichiers. */
  driver: "blob" | "local";
}) {
  const [alt, setAlt] = useState("");
  const [role, setRole] = useState<AdminImage["role"]>("GALLERY");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function upload(file: File) {
    // Le texte alternatif est exigé avant l'envoi : le demander après
    // reviendrait à accepter des images sans alt à la première distraction.
    if (!alt.trim()) {
      setError("Renseignez le texte alternatif avant d'envoyer l'image.");
      return;
    }

    const data = new FormData();
    data.set("file", file);
    data.set("productSlug", productSlug);
    data.set("alt", alt);
    data.set("role", role);

    startTransition(async () => {
      const r = await uploadProductImage(data);
      if (r.ok) {
        setError(null);
        setNotice(`Image envoyée — ${r.data.count} tailles générées.`);
        setAlt("");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
        return;
      }
      setError(r.message);
      setNotice(null);
    });
  }

  function remove(imageId: string) {
    startTransition(async () => {
      const r = await removeProductImage({ imageId, productSlug });
      if (r.ok) {
        setNotice("Image supprimée, y compris du stockage.");
        setError(null);
        router.refresh();
        return;
      }
      setError(r.message);
    });
  }

  function move(index: number, delta: number) {
    const next = [...images];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];

    startTransition(async () => {
      const r = await reorderProductImages({
        productSlug,
        imageIds: next.map((i) => i.id),
      });
      if (r.ok) router.refresh();
      else setError(r.message);
    });
  }

  return (
    <section className="mt-10 border-t border-line pt-8">
      <h2 className="m-0 mb-2 font-serif text-[1.4rem] font-normal">Images</h2>
      <p className="m-0 mb-6 max-w-[70ch] text-[12.5px] leading-[1.6] text-muted-ink">
        JPG, PNG ou WebP, 10 Mo maximum. Chaque image est convertie en WebP et
        déclinée en trois largeurs. Destination :{" "}
        <strong>{driver === "blob" ? "Vercel Blob" : "disque local (dev)"}</strong>.
      </p>

      {error && (
        <p role="alert" className="m-0 mb-4 text-[13px] text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="m-0 mb-4 text-[13px] text-green-700">
          {notice}
        </p>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="img-alt">
            Texte alternatif <span className="text-red-700">*</span>
          </label>
          <input
            id="img-alt"
            className={field}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="Flacon de sérum sur fond sable"
          />
          <span className="mt-1 block text-[11.5px] text-muted-ink">
            Obligatoire — lu par les lecteurs d&apos;écran et les moteurs de
            recherche.
          </span>
        </div>

        <div>
          <label className={label} htmlFor="img-role">
            Rôle
          </label>
          <select
            id="img-role"
            className={field}
            value={role}
            onChange={(e) => setRole(e.target.value as AdminImage["role"])}
          >
            <option value="PRIMARY">Couverture</option>
            <option value="HOVER">Survol</option>
            <option value="GALLERY">Galerie</option>
          </select>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={pending}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
        className="mb-8 block text-[13px] file:mr-4 file:cursor-pointer file:border file:border-ink file:bg-ink file:px-6 file:py-2 file:text-[11.5px] file:font-semibold file:uppercase file:tracking-[.16em] file:text-white"
      />

      {pending && (
        <p className="mb-4 text-[13px] text-muted-ink">Traitement en cours…</p>
      )}

      {images.length === 0 ? (
        <p className="text-[13px] text-muted-ink">
          Aucune image. La fiche produit affichera un emplacement vide.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img, i) => (
            <li key={img.id} className="border border-line p-3">
              <div className="relative mb-3 aspect-square overflow-hidden bg-sand-card">
                <Image
                  src={img.blobUrl}
                  alt={img.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, 30vw"
                  className="object-cover"
                />
                <span className="absolute left-2 top-2 bg-ink/[.78] px-2 py-1 text-[10px] uppercase tracking-[.14em] text-white">
                  {ROLE_LABEL[img.role]}
                </span>
              </div>
              <p className="m-0 mb-3 text-[12.5px] leading-[1.5] text-body">
                {img.alt}
              </p>
              <div className="flex items-center gap-3 text-[12px]">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || pending}
                  className="cursor-pointer bg-transparent underline underline-offset-4 disabled:cursor-default disabled:opacity-40"
                >
                  ← Avancer
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === images.length - 1 || pending}
                  className="cursor-pointer bg-transparent underline underline-offset-4 disabled:cursor-default disabled:opacity-40"
                >
                  Reculer →
                </button>
                <button
                  type="button"
                  onClick={() => remove(img.id)}
                  disabled={pending}
                  className="ml-auto cursor-pointer bg-transparent text-red-700 underline underline-offset-4 disabled:opacity-40"
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
