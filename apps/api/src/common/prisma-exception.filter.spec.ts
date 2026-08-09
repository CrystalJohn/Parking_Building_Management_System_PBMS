import { HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

const makeHost = () => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  return {
    res,
    host: {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => ({ url: '/sessions/abc/payments/bank-qr' }),
      }),
    } as any,
  };
};

const knownError = (code: string, target?: string | string[]) =>
  new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: 'test',
    meta: target === undefined ? undefined : { target },
  });

describe('PrismaExceptionFilter', () => {
  let filter: PrismaExceptionFilter;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    // The adapter is only used by the base filter for unmapped errors.
    filter = new PrismaExceptionFilter({} as any);
  });

  afterEach(() => jest.restoreAllMocks());

  it('maps a unique-constraint race to 409 instead of 500', () => {
    const { res, host } = makeHost();

    filter.catch(knownError('P2002', 'session_id'), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        message: expect.stringContaining('session_id'),
      }),
    );
  });

  it('maps a vanished record to 404', () => {
    const { res, host } = makeHost();

    filter.catch(knownError('P2025'), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('maps a bad foreign key to 400', () => {
    const { res, host } = makeHost();

    filter.catch(knownError('P2003', ['slot_id']), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
  });

  it('leaves an unmapped Prisma code to the base filter', () => {
    const { res, host } = makeHost();
    const superCatch = jest
      .spyOn(BaseExceptionFilter.prototype, 'catch')
      .mockImplementation(() => undefined);

    filter.catch(knownError('P1001'), host);

    expect(res.status).not.toHaveBeenCalled();
    expect(superCatch).toHaveBeenCalled();
  });

  it('logs a malformed-query error loudly and still lets it be a 500', () => {
    const { res, host } = makeHost();
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    jest
      .spyOn(BaseExceptionFilter.prototype, 'catch')
      .mockImplementation(() => undefined);

    filter.catch(
      new Prisma.PrismaClientValidationError('Argument id must not be null', {
        clientVersion: 'test',
      }),
      host,
    );

    expect(res.status).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('malformed query'),
    );
  });
});
