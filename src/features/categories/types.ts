export interface CategoryOptionDTO {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  parentId: string | null;
  color: string | null;
  icon: string | null;
}
