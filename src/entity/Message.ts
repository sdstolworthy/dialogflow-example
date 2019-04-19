import {Entity, PrimaryGeneratedColumn, Column, BaseEntity} from "typeorm";

@Entity()
export class Message extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    text: string;

    @Column()
    time: Date;

    @Column()
    outbound: boolean;

    @Column()
    patronPhone: string;

    @Column()
    mediaUrl: string;
}
