import { describe, test, expect, vi, beforeEach, type Mock } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// All mocks must be declared before importing the hook
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

import { useAuth } from "@/hooks/use-auth";
import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

// Typed mock helpers
const mockSignIn = signInAction as Mock;
const mockSignUp = signUpAction as Mock;
const mockGetAnonWorkData = getAnonWorkData as Mock;
const mockClearAnonWork = clearAnonWork as Mock;
const mockGetProjects = getProjects as Mock;
const mockCreateProject = createProject as Mock;

// Default setup: no anon work, no existing projects, create resolves with a new project
function setupDefaults() {
  mockGetAnonWorkData.mockReturnValue(null);
  mockGetProjects.mockResolvedValue([]);
  mockCreateProject.mockResolvedValue({ id: "new-project-1" });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaults();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("initial state", () => {
  test("isLoading starts as false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  test("exposes signIn, signUp, and isLoading", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
    expect(typeof result.current.isLoading).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// signIn — happy path
// ---------------------------------------------------------------------------

describe("signIn — happy path", () => {
  test("calls signInAction with provided credentials", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockSignIn).toHaveBeenCalledWith("user@example.com", "password123");
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  test("returns the result from signInAction", async () => {
    const authResult = { success: true };
    mockSignIn.mockResolvedValue(authResult);
    mockCreateProject.mockResolvedValue({ id: "proj-42" });

    const { result } = renderHook(() => useAuth());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.signIn("user@example.com", "password123");
    });

    expect(returned).toEqual(authResult);
  });

  test("returns failure result without navigating", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());
    const returned = await act(async () =>
      result.current.signIn("user@example.com", "wrong")
    );

    expect(returned).toEqual({ success: false, error: "Invalid credentials" });
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// signIn — isLoading state
// ---------------------------------------------------------------------------

describe("signIn — isLoading state", () => {
  test("isLoading is true while signIn is in progress", async () => {
    let resolveSignIn!: (v: { success: boolean }) => void;
    mockSignIn.mockReturnValue(new Promise((r) => { resolveSignIn = r; }));

    const { result } = renderHook(() => useAuth());

    // Start signIn without awaiting
    let signInPromise!: Promise<unknown>;
    act(() => {
      signInPromise = result.current.signIn("user@example.com", "password");
    });

    expect(result.current.isLoading).toBe(true);

    // Resolve and finish
    await act(async () => {
      resolveSignIn({ success: false });
      await signInPromise;
    });
  });

  test("isLoading is false after signIn resolves successfully", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockCreateProject.mockResolvedValue({ id: "proj-1" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("isLoading is false after signIn resolves with failure", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "wrong");
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("isLoading resets to false even when signInAction throws", async () => {
    mockSignIn.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      try {
        await result.current.signIn("user@example.com", "password");
      } catch {
        // expected
      }
    });

    expect(result.current.isLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// signUp — happy path
// ---------------------------------------------------------------------------

describe("signUp — happy path", () => {
  test("calls signUpAction with provided credentials", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email taken" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "secure123");
    });

    expect(mockSignUp).toHaveBeenCalledWith("new@example.com", "secure123");
    expect(mockSignUp).toHaveBeenCalledTimes(1);
  });

  test("returns the result from signUpAction", async () => {
    const authResult = { success: true };
    mockSignUp.mockResolvedValue(authResult);
    mockCreateProject.mockResolvedValue({ id: "proj-99" });

    const { result } = renderHook(() => useAuth());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.signUp("new@example.com", "secure123");
    });

    expect(returned).toEqual(authResult);
  });

  test("returns failure result without navigating", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

    const { result } = renderHook(() => useAuth());
    const returned = await act(async () =>
      result.current.signUp("taken@example.com", "pass1234")
    );

    expect(returned).toEqual({ success: false, error: "Email already registered" });
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// signUp — isLoading state
// ---------------------------------------------------------------------------

describe("signUp — isLoading state", () => {
  test("isLoading is true while signUp is in progress", async () => {
    let resolveSignUp!: (v: { success: boolean }) => void;
    mockSignUp.mockReturnValue(new Promise((r) => { resolveSignUp = r; }));

    const { result } = renderHook(() => useAuth());

    let signUpPromise!: Promise<unknown>;
    act(() => {
      signUpPromise = result.current.signUp("new@example.com", "password");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignUp({ success: false });
      await signUpPromise;
    });
  });

  test("isLoading is false after signUp resolves", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email taken" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "pass1234");
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("isLoading resets to false even when signUpAction throws", async () => {
    mockSignUp.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      try {
        await result.current.signUp("new@example.com", "pass1234");
      } catch {
        // expected
      }
    });

    expect(result.current.isLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handlePostSignIn — anon work with messages
// ---------------------------------------------------------------------------

describe("handlePostSignIn — anon work with messages", () => {
  const anonWork = {
    messages: [{ role: "user", content: "build me a button" }],
    fileSystemData: { "/App.jsx": "export default () => <button />" },
  };

  beforeEach(() => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(anonWork);
    mockCreateProject.mockResolvedValue({ id: "anon-project-1" });
  });

  test("creates a project from the anonymous work", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    expect(mockCreateProject).toHaveBeenCalledWith({
      name: expect.stringContaining("Design from"),
      messages: anonWork.messages,
      data: anonWork.fileSystemData,
    });
  });

  test("clears anonymous work after creating the project", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    expect(mockClearAnonWork).toHaveBeenCalledTimes(1);
  });

  test("navigates to the newly created project", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    expect(mockPush).toHaveBeenCalledWith("/anon-project-1");
  });

  test("does not call getProjects when anon work exists", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    expect(mockGetProjects).not.toHaveBeenCalled();
  });

  test("project name includes the current time string", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    const [call] = mockCreateProject.mock.calls;
    expect(call[0].name).toMatch(/^Design from /);
  });
});

// ---------------------------------------------------------------------------
// handlePostSignIn — anon work with no messages (empty array)
// ---------------------------------------------------------------------------

describe("handlePostSignIn — anon work present but messages is empty", () => {
  beforeEach(() => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
    mockGetProjects.mockResolvedValue([{ id: "existing-proj" }]);
  });

  test("falls through to getProjects and navigates to existing project", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockGetProjects).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/existing-proj");
  });
});

// ---------------------------------------------------------------------------
// handlePostSignIn — no anon work, existing projects
// ---------------------------------------------------------------------------

describe("handlePostSignIn — no anon work, has existing projects", () => {
  beforeEach(() => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([
      { id: "recent-project" },
      { id: "older-project" },
    ]);
  });

  test("navigates to the most recent project (first in list)", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    expect(mockPush).toHaveBeenCalledWith("/recent-project");
  });

  test("does not create a new project when existing projects are found", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  test("calls getProjects once", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    expect(mockGetProjects).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// handlePostSignIn — no anon work, no existing projects
// ---------------------------------------------------------------------------

describe("handlePostSignIn — no anon work, no existing projects", () => {
  beforeEach(() => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "brand-new-project" });
  });

  test("creates a new project with empty messages and data", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    expect(mockCreateProject).toHaveBeenCalledWith({
      name: expect.stringMatching(/^New Design #\d+$/),
      messages: [],
      data: {},
    });
  });

  test("navigates to the new project", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    expect(mockPush).toHaveBeenCalledWith("/brand-new-project");
  });

  test("new project name matches the expected pattern", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    const [call] = mockCreateProject.mock.calls;
    expect(call[0].name).toMatch(/^New Design #\d+$/);
  });

  test("does not clear anon work when there is none", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    expect(mockClearAnonWork).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handlePostSignIn — via signUp (same routing logic applies)
// ---------------------------------------------------------------------------

describe("handlePostSignIn — triggered via signUp", () => {
  test("navigates to existing project after successful signUp", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([{ id: "signup-project" }]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(mockPush).toHaveBeenCalledWith("/signup-project");
  });

  test("creates project from anon work after successful signUp", async () => {
    const anonWork = {
      messages: [{ role: "user", content: "hello" }],
      fileSystemData: { "/App.jsx": "" },
    };
    mockSignUp.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(anonWork);
    mockCreateProject.mockResolvedValue({ id: "signup-anon-project" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: anonWork.messages })
    );
    expect(mockPush).toHaveBeenCalledWith("/signup-anon-project");
  });
});

// ---------------------------------------------------------------------------
// edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  test("concurrent calls each manage isLoading independently", async () => {
    // Both calls resolve successfully; just verify no crashes and final state
    mockSignIn.mockResolvedValue({ success: false, error: "err" });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await Promise.all([
        result.current.signIn("a@b.com", "pass1"),
        result.current.signIn("c@d.com", "pass2"),
      ]);
    });

    expect(result.current.isLoading).toBe(false);
    expect(mockSignIn).toHaveBeenCalledTimes(2);
  });

  test("signIn does not navigate when result.success is false", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Bad password" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "wrong");
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockGetProjects).not.toHaveBeenCalled();
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  test("signUp does not navigate when result.success is false", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("taken@example.com", "pass1234");
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockGetProjects).not.toHaveBeenCalled();
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  test("router.push is called exactly once per successful sign-in", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([{ id: "only-project" }]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password");
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
