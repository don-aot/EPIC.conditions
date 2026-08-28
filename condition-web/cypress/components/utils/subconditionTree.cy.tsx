/// <reference types="cypress" />

import {
  ROOT_DROPPABLE_ID,
  reorderSubconditions,
  indentSubcondition,
  outdentSubcondition,
} from "../../../src/components/ConditionDetails/subconditionTree";
import type { SubconditionModel } from "../../../src/models/Subcondition";

const node = (
  id: string,
  sortOrder: number,
  subconditions: SubconditionModel[] = []
): SubconditionModel => ({
  subcondition_id: id,
  subcondition_identifier: id,
  subcondition_text: `text-${id}`,
  sort_order: sortOrder,
  subconditions,
});

const buildTree = (): SubconditionModel[] => [
  node("a", 1),
  node("b", 2, [node("b1", 1), node("b2", 2)]),
  node("c", 3),
];

describe("reorderSubconditions", () => {
  it("returns the tree unchanged when fromIndex equals toIndex", () => {
    const tree = buildTree();
    const result = reorderSubconditions(tree, ROOT_DROPPABLE_ID, 1, 1);
    expect(result).to.deep.equal(tree);
  });

  it("reorders top-level nodes and renormalizes sort_order", () => {
    const tree = buildTree();
    const result = reorderSubconditions(tree, ROOT_DROPPABLE_ID, 0, 2);
    expect(result.map((n) => n.subcondition_id)).to.deep.equal(["b", "c", "a"]);
    expect(result.map((n) => n.sort_order)).to.deep.equal([1, 2, 3]);
  });

  it("reorders nested children under a parent", () => {
    const tree = buildTree();
    const result = reorderSubconditions(tree, "b", 0, 1);
    const parentB = result.find((n) => n.subcondition_id === "b")!;
    expect(parentB.subconditions!.map((n: SubconditionModel) => n.subcondition_id)).to.deep.equal(["b2", "b1"]);
    expect(parentB.subconditions!.map((n: SubconditionModel) => n.sort_order)).to.deep.equal([1, 2]);
  });
});

describe("indentSubcondition", () => {
  it("returns the tree unchanged when the node id is not found", () => {
    const tree = buildTree();
    const result = indentSubcondition(tree, "does-not-exist");
    expect(result).to.deep.equal(tree);
  });

  it("returns the tree unchanged when the node has no previous sibling", () => {
    const tree = buildTree();
    const result = indentSubcondition(tree, "a");
    expect(result).to.deep.equal(tree);
  });

  it("moves a top-level node under its previous sibling", () => {
    const tree = buildTree();
    const result = indentSubcondition(tree, "c");

    expect(result.map((n) => n.subcondition_id)).to.deep.equal(["a", "b"]);
    const parentB = result.find((n) => n.subcondition_id === "b")!;
    expect(parentB.subconditions!.map((n: SubconditionModel) => n.subcondition_id)).to.deep.equal(["b1", "b2", "c"]);
  });

  it("moves a nested node under its previous nested sibling", () => {
    const tree = buildTree();
    const result = indentSubcondition(tree, "b2");

    const parentB = result.find((n) => n.subcondition_id === "b")!;
    expect(parentB.subconditions!.map((n: SubconditionModel) => n.subcondition_id)).to.deep.equal(["b1"]);
    const parentB1 = parentB.subconditions!.find((n: SubconditionModel) => n.subcondition_id === "b1")!;
    expect(parentB1.subconditions!.map((n: SubconditionModel) => n.subcondition_id)).to.deep.equal(["b2"]);
  });
});

describe("outdentSubcondition", () => {
  it("returns the tree unchanged when the node id is not found", () => {
    const tree = buildTree();
    const result = outdentSubcondition(tree, "does-not-exist");
    expect(result).to.deep.equal(tree);
  });

  it("returns the tree unchanged for an already top-level node", () => {
    const tree = buildTree();
    const result = outdentSubcondition(tree, "a");
    expect(result).to.deep.equal(tree);
  });

  it("moves a nested node up to be a sibling of its former parent, taking trailing siblings with it", () => {
    const tree = buildTree();
    const result = outdentSubcondition(tree, "b1");

    expect(result.map((n) => n.subcondition_id)).to.deep.equal(["a", "b", "b1", "c"]);
    const parentB = result.find((n) => n.subcondition_id === "b")!;
    expect(parentB.subconditions ?? []).to.deep.equal([]);
    const movedB1 = result.find((n) => n.subcondition_id === "b1")!;
    expect(movedB1.subconditions!.map((n: SubconditionModel) => n.subcondition_id)).to.deep.equal(["b2"]);
  });
});
