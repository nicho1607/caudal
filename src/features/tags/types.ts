/** GET /api/v1/tags: etiqueta del usuario (orden alfabético). */
export interface TagDTO {
  id: string;
  name: string;
  color: string | null;
}
