import { BotCommandsService } from './bot-commands.service';

function fakeBot(): { telegram: Record<string, jest.Mock> } {
  return {
    telegram: {
      deleteMyCommands: jest.fn().mockResolvedValue(true),
      setChatMenuButton: jest.fn().mockResolvedValue(true),
      setMyDescription: jest.fn().mockResolvedValue(true),
      setMyShortDescription: jest.fn().mockResolvedValue(true),
    },
  };
}

describe('BotCommandsService', () => {
  it('points the menu button at the Mini App and sets the profile texts', async () => {
    const bot = fakeBot();
    const service = new BotCommandsService(
      bot as never,
      { webAppUrl: 'https://thinkread-frontend.vercel.app/' } as never,
    );
    await service.onApplicationBootstrap();
    expect(bot.telegram.deleteMyCommands).toHaveBeenCalledTimes(3);
    expect(bot.telegram.setChatMenuButton).toHaveBeenCalledWith({
      menuButton: {
        type: 'web_app',
        text: 'Открыть ThinkRead',
        web_app: { url: 'https://thinkread-frontend.vercel.app/' },
      },
    });
    expect(bot.telegram.setMyDescription).toHaveBeenCalledWith(
      expect.stringContaining('ThinkRead'),
    );
    expect(bot.telegram.setMyShortDescription).toHaveBeenCalled();
  });

  it('falls back to the default menu button without WEBAPP_URL and survives API failures', async () => {
    const bot = fakeBot();
    bot.telegram.setMyDescription.mockRejectedValue(new Error('network'));
    const service = new BotCommandsService(bot as never, { webAppUrl: undefined } as never);
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(bot.telegram.setChatMenuButton).toHaveBeenCalledWith({
      menuButton: { type: 'default' },
    });
  });
});
