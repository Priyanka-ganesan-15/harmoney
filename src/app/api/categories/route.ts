import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/permissions";
import { Category } from "@/server/models/category";

const createCategorySchema = z.object({
  name: z.string().min(2).max(80),
  kind: z.enum(["expense", "income"]).default("expense"),
  parentCategoryId: z.string().optional().nullable(),
});

export async function GET() {
  try {
    const context = await requireHouseholdContext();

    const categories = await Category.find({
      householdId: context.householdId,
      archivedAt: null,
    })
      .sort({ kind: 1, name: 1 })
      .lean();

    return NextResponse.json({
      categories: categories.map((category) => ({
        id: category._id.toString(),
        name: category.name,
        kind: category.kind,
        parentCategoryId: category.parentCategoryId?.toString() ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to list categories." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const parsed = createCategorySchema.parse(await request.json());

    // Validate parent category if provided
    let parentCategoryId: Types.ObjectId | null = null;

    if (parsed.parentCategoryId) {
      if (!Types.ObjectId.isValid(parsed.parentCategoryId)) {
        return NextResponse.json({ message: "Invalid parent category id." }, { status: 400 });
      }

      const parentCategory = await Category.findOne({
        _id: parsed.parentCategoryId,
        householdId: context.householdId,
        kind: parsed.kind,
        archivedAt: null,
      }).lean();

      if (!parentCategory) {
        return NextResponse.json(
          { message: "Parent category not found." },
          { status: 404 },
        );
      }

      parentCategoryId = new Types.ObjectId(parsed.parentCategoryId);
    }

    const category = await Category.create({
      householdId: context.householdId,
      name: parsed.name.trim(),
      kind: parsed.kind,
      parentCategoryId: parentCategoryId || null,
    });

    return NextResponse.json({
      success: true,
      category: {
        id: category._id.toString(),
        name: category.name,
        kind: category.kind,
        parentCategoryId: category.parentCategoryId?.toString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid category payload.", issues: error.issues },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message.includes("E11000")) {
      return NextResponse.json(
        { message: "Category already exists for this type." },
        { status: 409 },
      );
    }

    return NextResponse.json({ message: "Unable to create category." }, { status: 500 });
  }
}
