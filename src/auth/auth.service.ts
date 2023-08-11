import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthDto } from './dto';
import * as argon from 'argon2';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}
  
  async signup(dto: AuthDto) {
    try {
      // generate password hash
      const passwordHash = await argon.hash(dto.password);

      // save user in db
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          hash: passwordHash
        }
      });

      delete user.hash;

      // return the saved user
      return user;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Credentials taken');
        }
      }

      throw error;      
    }
  }

  async signin(dto: AuthDto) {
    try {
      // find user by email
      const user = await this.prisma.user.findUniqueOrThrow({
        where: {
          email: dto.email,
        }
      });

      const passwordMatches = await argon.verify(user.hash, dto.password);

      if (!passwordMatches) throw new UnauthorizedException('Credentials incorrect');

      return this.signToken(user.id, user.email);
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new UnauthorizedException('Credentials incorrect');
        }
      }

      throw error;
    }
  }
  
  async signToken(userId: number, email: string): Promise<{access_token: string}> {
    const payload = {
      sub: userId,
      email
    }

    const token = await this.jwt.signAsync(payload, {
      expiresIn: '15m',
      secret: this.config.get('JWT_SECRET'),
    })

    return {
      access_token: token,
    }
  }
}
