/*
	Spacebar: A FOSS re-implementation and extension of the Discord.com backend.
	Copyright (C) 2023 Spacebar and Spacebar Contributors

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published
	by the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { route } from "@spacebar/api/util";
import { Channel, ThreadMember } from "@spacebar/database";
import { ChannelType } from "@spacebar/schemas";
import { getPermission } from "@spacebar/util";
import { Request, Response, Router } from "express";
import { In } from "typeorm";

const router = Router({ mergeParams: true });

// GET /guilds/:guild_id/threads/active — every unarchived thread in the
// guild, plus the requester's thread-member records (Discord shape).
router.get("/", route({}), async (req: Request, res: Response) => {
	const { guild_id } = req.params as { [key: string]: string };

	const permissions = await getPermission(req.user_id, guild_id);
	permissions.hasThrow("VIEW_CHANNEL");

	const candidates = (
		await Channel.find({
			where: {
				guild_id,
				type: In([ChannelType.GUILD_NEWS_THREAD, ChannelType.GUILD_PUBLIC_THREAD, ChannelType.GUILD_PRIVATE_THREAD]),
			},
		})
	).filter((thread) => !thread.thread_metadata?.archived);

	// Filter to threads the caller can actually reach: VIEW_CHANNEL on the
	// parent channel, and for private threads, thread membership (or
	// MANAGE_THREADS). A guild-level check alone would leak private-thread and
	// hidden-channel metadata (names/parents/owners) to any member.
	const parentPerms = new Map<string, Awaited<ReturnType<typeof getPermission>>>();
	const threads = [];
	for (const thread of candidates) {
		if (!thread.parent_id) continue;
		let perm = parentPerms.get(thread.parent_id);
		if (!perm) {
			perm = await getPermission(req.user_id, guild_id, thread.parent_id);
			parentPerms.set(thread.parent_id, perm);
		}
		if (!perm.has("VIEW_CHANNEL")) continue;
		if (thread.type === ChannelType.GUILD_PRIVATE_THREAD && !perm.has("MANAGE_THREADS")) {
			const isMember = await ThreadMember.count({
				where: { id: thread.id, member: { id: req.user_id, guild_id } },
			});
			if (!isMember) continue;
		}
		threads.push(thread);
	}

	const memberRows = threads.length
		? await ThreadMember.find({
				where: {
					id: In(threads.map((thread) => thread.id)),
					member: { id: req.user_id, guild_id },
				},
			})
		: [];

	return res.json({
		threads,
		members: memberRows.map((row) => ({
			id: row.id,
			user_id: req.user_id,
			join_timestamp: row.join_timestamp,
			flags: row.flags,
		})),
	});
});

export default router;
