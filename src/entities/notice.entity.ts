import { Column, Entity } from "typeorm";
import { BaseEntity } from "./base.entity";

@Entity({ name: "notices", schema: "todo_list" })
export class Notice extends BaseEntity {
  @Column({ length: 100 })
  title: string;

  @Column({ type: "text" })
  content: string;

  @Column({ name: "is_published", default: false })
  isPublished: boolean;
}
