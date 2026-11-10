import type { Diagram } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import type { StyleId } from "../diagram/styles";
import { buildOrg } from "./model";

const person = (
  key: string,
  name: string,
  title: string,
  department: string,
  manager = "",
  vacant = false,
): { key: string; name: string; title: string; department: string; manager: string; vacant: boolean } => ({
  key,
  name,
  title,
  department,
  manager,
  vacant,
});

/** Example org chart: a small product company. */
export function orgTemplate(styleId: StyleId, title: string, blank: boolean): Diagram {
  if (blank) return createDiagram("Untitled org chart", styleId, "org");
  return buildOrg(
    title,
    [
      person("ceo", "Maya Patel", "Chief Executive", "Leadership"),
      person("cto", "Tom Okafor", "Chief Technology Officer", "Engineering", "ceo"),
      person("design", "Lena Fischer", "Head of Design", "Design", "ceo"),
      person("ops", "Sam Rivera", "Head of Operations", "Operations", "ceo"),
      person("platform", "Arjun Mehta", "Platform Lead", "Engineering", "cto"),
      person("product", "Chloe Martin", "Product Engineering Lead", "Engineering", "cto"),
      person("eng1", "Noah Kim", "Backend Engineer", "Engineering", "platform"),
      person("eng2", "Open position", "Site Reliability Engineer", "Engineering", "platform", true),
      person("eng3", "Ella Brooks", "Frontend Engineer", "Engineering", "product"),
      person("des1", "Omar Haddad", "Product Designer", "Design", "design"),
      person("sup", "Grace Liu", "Customer Support", "Operations", "ops"),
      person("fin", "Ben Carter", "Finance", "Operations", "ops"),
    ],
    "TB",
    styleId === "sketch" ? "sketch" : "professional",
  );
}
