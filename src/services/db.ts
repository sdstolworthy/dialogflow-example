import { createConnection, Connection } from "typeorm";

class DbConnector {
  private db: Promise<Connection>
  constructor(){
    this.db = createConnection('spencer')
  }
}