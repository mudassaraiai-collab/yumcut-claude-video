import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectStatus } from '@/shared/constants/status';

const transaction = vi.hoisted(() => vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)));
const userCount = vi.hoisted(() => vi.fn());
const userFindMany = vi.hoisted(() => vi.fn());
const projectCount = vi.hoisted(() => vi.fn());
const projectFindMany = vi.hoisted(() => vi.fn());
const templateCount = vi.hoisted(() => vi.fn());
const templateArtStyleCount = vi.hoisted(() => vi.fn());
const templateVoiceStyleCount = vi.hoisted(() => vi.fn());
const templateVoiceCount = vi.hoisted(() => vi.fn());
const templateMusicCount = vi.hoisted(() => vi.fn());
const templateCaptionsStyleCount = vi.hoisted(() => vi.fn());
const templateOverlayCount = vi.hoisted(() => vi.fn());
const tokenTransactionFindMany = vi.hoisted(() => vi.fn());

vi.mock('@/server/db', () => ({
  prisma: {
    $transaction: transaction,
    user: {
      count: userCount,
      findMany: userFindMany,
    },
    project: {
      count: projectCount,
      findMany: projectFindMany,
    },
    template: {
      count: templateCount,
    },
    templateArtStyle: {
      count: templateArtStyleCount,
    },
    templateVoiceStyle: {
      count: templateVoiceStyleCount,
    },
    templateVoice: {
      count: templateVoiceCount,
    },
    templateMusic: {
      count: templateMusicCount,
    },
    templateCaptionsStyle: {
      count: templateCaptionsStyleCount,
    },
    templateOverlay: {
      count: templateOverlayCount,
    },
    tokenTransaction: {
      findMany: tokenTransactionFindMany,
    },
  },
}));

import { getAdminDashboardSnapshot } from '@/server/admin/dashboard';

function setupDefaultMockData() {
  transaction.mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations));
  userCount.mockResolvedValue(123);
  projectCount.mockResolvedValue(7);

  userFindMany.mockImplementation(async (args: any) => {
    if (args?.select?.createdAt === true && !args?.select?.id) {
      return [{ createdAt: new Date('2026-03-10T10:00:00.000Z') }];
    }

    return [
      {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        createdAt: new Date('2026-03-12T10:00:00.000Z'),
      },
    ];
  });

  projectFindMany.mockImplementation(async (args: any) => {
    if (args?.where?.status === ProjectStatus.Error) {
      return [
        {
          id: 'project-error',
          title: 'Broken project',
          updatedAt: new Date('2026-03-13T10:00:00.000Z'),
          statusLog: [{ message: 'test error' }],
          user: { id: 'user-1', email: 'user@example.com', name: 'User' },
        },
      ];
    }

    return [
      {
        id: 'project-1',
        title: 'Project',
        status: ProjectStatus.New,
        createdAt: new Date('2026-03-12T10:00:00.000Z'),
        user: { id: 'user-1', email: 'user@example.com', name: 'User' },
      },
    ];
  });

  templateCount.mockResolvedValue(1);
  templateArtStyleCount.mockResolvedValue(1);
  templateVoiceStyleCount.mockResolvedValue(1);
  templateVoiceCount.mockResolvedValue(1);
  templateMusicCount.mockResolvedValue(1);
  templateCaptionsStyleCount.mockResolvedValue(1);
  templateOverlayCount.mockResolvedValue(1);
  tokenTransactionFindMany.mockResolvedValue([]);
}

describe('getAdminDashboardSnapshot user analytics filters', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupDefaultMockData();
  });

  it('excludes guest users from recent list by default, while analytics still exclude deleted', async () => {
    await getAdminDashboardSnapshot();

    expect(userCount).toHaveBeenCalledWith({
      where: {
        deleted: false,
        email: { not: { endsWith: '@guest.yumcut' } },
      },
    });

    const recentUsersQuery = userFindMany.mock.calls[0]?.[0];
    expect(recentUsersQuery.where).toEqual({
      email: { not: { endsWith: '@guest.yumcut' } },
    });

    const dailyNewUsersQuery = userFindMany.mock.calls[1]?.[0];
    expect(dailyNewUsersQuery.where).toMatchObject({
      deleted: false,
      email: { not: { endsWith: '@guest.yumcut' } },
    });
    expect(dailyNewUsersQuery.where.createdAt).toBeDefined();
  });

  it('includes guest users in recent list when includeGuestUsers=true while analytics still exclude deleted', async () => {
    await getAdminDashboardSnapshot({ includeGuestUsers: true });

    expect(userCount).toHaveBeenCalledWith({ where: { deleted: false } });

    const recentUsersQuery = userFindMany.mock.calls[0]?.[0];
    expect(recentUsersQuery.where).toEqual({});

    const dailyNewUsersQuery = userFindMany.mock.calls[1]?.[0];
    expect(dailyNewUsersQuery.where.createdAt).toBeDefined();
    expect(dailyNewUsersQuery.where.deleted).toBe(false);
    expect(dailyNewUsersQuery.where.email).toBeUndefined();
  });
});
