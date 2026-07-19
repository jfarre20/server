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

	const threads = (
		await Channel.find({
			where: {
				guild_id,
				type: In([ChannelType.GUILD_NEWS_THREAD, ChannelType.GUILD_PUBLIC_THREAD, ChannelType.GUILD_PRIVATE_THREAD]),
			},
		})
	).filter((thread) => !thread.thread_metadata?.archived);

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
